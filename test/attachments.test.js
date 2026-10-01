const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { createAttachmentStore, extractZip } = require('../src/attachment-store');
const { parseAttachmentPaths, attachmentPathTokens } = require('../src/attachments');

function zipFixture(entries) {
  const locals = [], index = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = Buffer.from(entry.text || 'content');
    let crc = 0xffffffff;
    for (const b of body) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const content = zlib.deflateRawSync(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(entry.flags || 0, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(entry.flags || 0, 8); central.writeUInt16LE(entry.method || 8, 10);
    central.writeUInt32LE(entry.badCRC ? 0 : crc, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(entry.size || body.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(entry.attr || 0, 38); central.writeUInt32LE(offset, 42);
    const record = Buffer.concat([local, name, content]); locals.push(record); index.push(Buffer.concat([central, name])); offset += record.length;
  }
  const directory = Buffer.concat(index), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'deiza-attachments-test-'));
  try {
    const file = path.join(temp, 'document with spaces.txt'); fs.writeFileSync(file, 'Selected content');
    const folder = path.join(temp, 'project folder'); fs.mkdirSync(folder);
    const image = path.join(temp, 'screen.png'); fs.writeFileSync(image, Buffer.from([1, 2, 3]));
    const archive = path.join(temp, 'project.zip'); fs.writeFileSync(archive, zipFixture([{ name: 'src/main.js', text: 'export const test = true;' }]));
    const store = createAttachmentStore(path.join(temp, 'private'));
    const attached = await store.attach({ id: 'session-1', paths: [file, folder, archive, image] });
    assert.equal(attached.errors.length, 0);
    assert.deepEqual(attached.attachments.map(a => a.kind), ['file', 'folder', 'archive', 'image']);
    assert.equal(fs.readFileSync(attached.attachments[0].path, 'utf8'), 'Selected content');
    assert.equal(fs.readFileSync(path.join(attached.attachments[2].extracted_path, 'src/main.js'), 'utf8'), 'export const test = true;');
    assert.equal(store.resolve(attached.attachments, 'session-1').length, 4);
    assert.throws(() => store.resolve(attached.attachments, 'another-session'), /sesión/);
    assert(store.images(attached.attachments)[0].startsWith('data:image/png;base64,'));
    const manifest = path.join(temp, 'manifest.json'); fs.writeFileSync(manifest, '{"user":"selected contents"}');
    const manifestResult = await store.attach({ id: 'session-1', paths: [manifest] });
    assert.equal(fs.readFileSync(manifestResult.attachments[0].path, 'utf8'), '{"user":"selected contents"}');
    const svg = path.join(temp, 'design.svg'); fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const svgResult = await store.attach({ id: 'session-1', paths: [svg] });
    assert.equal(svgResult.attachments[0].kind, 'image'); assert.equal(store.images(svgResult.attachments).length, 0);
    assert.equal((await store.attach({ paths: 'invalid' })).errors.length, 1);
    if (process.platform !== 'win32') assert.equal(fs.statSync(manifestResult.attachments[0].path).mode & 0o077, 0);

    const parsed = parseAttachmentPaths(`Revisa "${file}" '${folder}'`);
    assert.deepEqual(parsed.paths, [file, folder]); assert.equal(parsed.promptText, 'Revisa');
    assert.deepEqual(parseAttachmentPaths(file).paths, [file]);
    assert.deepEqual(parseAttachmentPaths(file.replace(/ /g, '\\ ')).paths, [file]);
    assert.equal(parseAttachmentPaths("Don't rewrite the app.").promptText, "Don't rewrite the app.");
    assert.equal(parseAttachmentPaths('Explica "un ejemplo').paths.length, 0);
    assert.throws(() => parseAttachmentPaths('"unterminated', { all: true }), /comilla/);
    assert.equal(attachmentPathTokens('"C:\\Users\\Marcos\\My Docs\\input.zip"')[0].text, 'C:\\Users\\Marcos\\My Docs\\input.zip');

    const attacks = [
      [{ name: '../escaped.txt' }], [{ name: '/absolute.txt' }], [{ name: 'C:\\drive.txt' }],
      [{ name: 'safe.txt:secret' }], [{ name: 'NUL.txt' }], [{ name: 'trailing. ' }],
      [{ name: 'link', attr: 0xa000 << 16 >>> 0 }], [{ name: 'encrypted.txt', flags: 1 }],
      [{ name: 'bomb.txt', size: 65 * 1024 * 1024 }], [{ name: 'corrupt.txt', badCRC: true }],
      [{ name: 'unknown.txt', method: 9 }], [{ name: 'a.txt' }, { name: 'A.txt' }],
    ];
    for (let i = 0; i < attacks.length; i++) {
      const bad = path.join(temp, `bad-${i}.zip`), extracted = path.join(temp, `bad-${i}`);
      fs.writeFileSync(bad, zipFixture(attacks[i]));
      assert.throws(() => extractZip(bad, extracted));
      assert(!fs.existsSync(extracted), `No partial extraction left for attack ${i}`);
    }
    assert(!fs.existsSync(path.join(temp, 'escaped.txt')));
    console.log('PASS: files/folders/images/ZIP, quoted and dragged paths, session isolation, traversal/ADS/devices/symlink/bomb/CRC/encryption guards.');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });

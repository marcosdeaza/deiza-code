const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { requestComputerBridge, ComputerTools } = require('../src/computer-bridge');
const { computerTarget, describeComputerResult } = require('../src/computer-tools');
const { runAgentTurn } = require('../src/agent');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'deiza-computer-test-'));
  const previous = process.env.DEIZA_COMPUTER_BRIDGE_FILE;
  process.env.DEIZA_COMPUTER_BRIDGE_FILE = path.join(temp, 'bridge.json');
  const token = 'a'.repeat(64), image = 'data:image/png;base64,aW1hZ2U=';
  const toolRequests = [], modelRequests = [];
  let rounds = [], cancelled = false;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const json = body ? JSON.parse(body) : null;
      if (req.url === '/state' || req.url === '/tool') assert.equal(req.headers.authorization, `Bearer ${token}`);
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/state') return res.end(JSON.stringify({ connected: true }));
      if (req.url === '/tool') {
        toolRequests.push(json);
        if (json.name === 'wait') { res.on('close', () => { cancelled = true; }); return; }
        const result = json.name.endsWith('_screenshot') ? { width: 1280, height: 800, capture: { data_url: image } } : { text: 'Visible page', elements: [{ element_id: 'e1', role: 'button', name: 'Test' }] };
        return res.end(JSON.stringify({ result }));
      }
      if (req.url === '/v1/chat/completions') {
        modelRequests.push(json);
        const calls = rounds.shift() || [];
        res.setHeader('Content-Type', 'text/event-stream');
        const delta = calls.length ? { tool_calls: calls.map((c, i) => ({ index: i, id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) } : { content: 'Verificado.' };
        return res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: calls.length ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  const originalWrite = process.stdout.write;
  let output = '';
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const writeConfig = (override = {}) => fs.writeFileSync(process.env.DEIZA_COMPUTER_BRIDGE_FILE, JSON.stringify({ url, token, pid: process.pid, version: 'test', ...override }), { mode: 0o600 });
    writeConfig();
    assert.equal((await requestComputerBridge('/state')).connected, true);
    const toolResult = await ComputerTools.browser_tabs({}, { cfg: { computerSessionId: 'cli_persisted' }, mode: 'plan' });
    assert.equal(toolResult.text, 'Visible page');
    assert.equal(toolRequests.at(-1).sessionId, 'cli_persisted'); assert.equal(toolRequests.at(-1).mode, 'plan');
    writeConfig({ url: 'https://example.test' }); await assert.rejects(requestComputerBridge('/state'), /127\.0\.0\.1/);
    writeConfig({ url: `http://127.0.0.1:${server.address().port}/?token=unsafe` }); await assert.rejects(requestComputerBridge('/state'), /127\.0\.0\.1/);
    writeConfig();
    if (process.platform !== 'win32') {
      fs.chmodSync(process.env.DEIZA_COMPUTER_BRIDGE_FILE, 0o644); await assert.rejects(requestComputerBridge('/state'), /Abre Deiza/);
      fs.chmodSync(process.env.DEIZA_COMPUTER_BRIDGE_FILE, 0o600);
    }
    const abort = new AbortController();
    const wait = requestComputerBridge('/tool', { name: 'wait' }, { signal: abort.signal });
    setTimeout(() => abort.abort(), 20); await assert.rejects(wait, /ABORTED/);
    await new Promise(resolve => setTimeout(resolve, 20)); assert(cancelled);

    process.stdout.write = (data) => { output += data; return true; };
    const cfg = { apiBase: url, apiKey: '', model: 'deiza-solid', computerSessionId: 'cli_integration', isCustomEndpoint: false };
    const execute = async (calls, opts = {}) => {
      rounds = [calls, []];
      const messages = [];
      await runAgentTurn({ cfg, messages, userInput: 'Prueba los controles', quiet: true, ...opts });
      return messages;
    };
    const messages = await execute([{ id: 'capture', name: 'browser_screenshot' }], { attachments: [{ name: 'project.zip', path: '/tmp/project.zip', extracted_path: '/tmp/project', kind: 'archive', size: 10 }] });
    assert(messages.some(m => m.role === 'tool' && m.tool_call_id === 'capture' && !m.content.includes('base64') && !m.content.includes('data_url')));
    assert(messages.some(m => m.role === 'user' && Array.isArray(m.content) && m.content.some(p => p.type === 'image_url' && p.image_url.url === image)));
    assert(messages.some(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('/tmp/project')));
    assert(modelRequests.at(-1).tools.some(t => t.function.name === 'desktop_click'));
    assert(!output.includes('base64'));

    let before = toolRequests.length;
    await execute([{ id: 'blocked', name: 'browser_click', args: { element_id: 'e1' } }, { id: 'read', name: 'browser_open', args: { url: 'https://example.test' } }], { mode: 'plan' });
    assert.deepEqual(toolRequests.slice(before).map(t => t.name), ['browser_open']);
    before = toolRequests.length;
    await execute([{ id: 'shot', name: 'desktop_screenshot' }, { id: 'dom', name: 'browser_click', args: { element_id: 'e1' } }], { cfg: { ...cfg, model: 'deiza-gas' } });
    assert.deepEqual(toolRequests.slice(before).map(t => t.name), ['browser_click']);
    before = toolRequests.length;
    let approval = '';
    await execute([{ id: 'typing', name: 'browser_type', args: { element_id: 'e1', text: 'private mail contents' } }], { mode: 'copilot', confirmCallback: async prompt => { approval = prompt; return false; } });
    assert.equal(toolRequests.length, before); assert(!approval.includes('private mail contents')); assert(!output.includes('private mail contents'));
    assert.equal(computerTarget('browser_open', { url: 'https://user:password@example.test/path?token=secret#hash' }), 'https://example.test/path');
    assert(!describeComputerResult('browser_type', { error: 'Cannot type private mail contents' }, { text: 'private mail contents' }).summary.includes('private mail contents'));
  } finally {
    process.stdout.write = originalWrite;
    if (previous === undefined) delete process.env.DEIZA_COMPUTER_BRIDGE_FILE; else process.env.DEIZA_COMPUTER_BRIDGE_FILE = previous;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log('PASS: authenticated local bridge, remote URL rejection, private token permissions, abort, real SSE tools/images, attachments, Plan/Gas/Copilot and private cards.');
})().catch(err => { console.error(err); process.exitCode = 1; });

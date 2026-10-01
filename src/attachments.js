/** Explicit local file paths pasted, dragged or selected with /attach. No directory scanning. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createAttachmentStore } = require('./attachment-store');

function attachmentPathTokens(value) {
  const input = String(value || '');
  const result = [];
  let start = -1, token = '', quote = '';
  for (let i = 0; i <= input.length; i++) {
    const ch = input[i];
    if (start < 0) {
      if (ch === undefined || /\s/.test(ch)) continue;
      start = i;
    }
    if (ch === undefined || (!quote && /\s/.test(ch))) {
      if (quote) throw new Error('Falta cerrar una comilla en la ruta del adjunto.');
      result.push({ text: token, start, end: i }); start = -1; token = ''; continue;
    }
    if (ch === quote) { quote = ''; continue; }
    if (!quote && !token && (ch === '"' || ch === "'")) { quote = ch; continue; }
    // Shell-dropped Unix paths escape spaces. Windows backslashes remain literal separators.
    if (ch === '\\' && input[i + 1] && /\s/.test(input[i + 1]) && !/^[a-z]:\\/i.test(token)) { token += input[++i]; continue; }
    token += ch;
  }
  return result;
}

function resolveAttachmentPath(value) {
  const candidate = String(value || '');
  return path.resolve(/^~[/\\]/.test(candidate) ? path.join(os.homedir(), candidate.slice(2)) : candidate);
}

function parseAttachmentPaths(value, { all = false } = {}) {
  const input = String(value || '').trim();
  if (!input) return { paths: [], promptText: '' };
  let tokens;
  // A plain pasted absolute path may contain spaces without shell escapes or quotes.
  const whole = resolveAttachmentPath(input);
  if (!all && (path.isAbsolute(input) || /^~[/\\]/.test(input)) && fs.existsSync(whole)) tokens = [{ text: input, start: 0, end: input.length }];
  else {
    try { tokens = attachmentPathTokens(input); }
    catch (err) { if (all) throw err; return { paths: [], promptText: input }; }
  }
  const selected = tokens.filter(token => all || fs.existsSync(resolveAttachmentPath(token.text)));
  let promptText = input;
  for (const token of [...selected].reverse()) promptText = promptText.slice(0, token.start) + promptText.slice(token.end);
  return { paths: selected.map(token => resolveAttachmentPath(token.text)), promptText: promptText.replace(/[ \t]{2,}/g, ' ').trim() };
}

let cliAttachmentStore = null;
function getCliAttachmentStore() {
  if (!cliAttachmentStore) cliAttachmentStore = createAttachmentStore(path.join(os.homedir(), '.deiza', 'attachments'));
  return cliAttachmentStore;
}

async function prepareCliAttachments(paths, sessionId) {
  return getCliAttachmentStore().attach({ id: sessionId, paths });
}

function cliAttachmentImages(list) {
  if (!list?.length) return [];
  return getCliAttachmentStore().images(list);
}

module.exports = { attachmentPathTokens, parseAttachmentPaths, prepareCliAttachments, cliAttachmentImages };

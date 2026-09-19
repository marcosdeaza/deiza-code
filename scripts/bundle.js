const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// node scripts/bundle.js [--flavor open|closed] [--out <file>]
//   open   -> GitHub edition: any OpenAI-compatible engine can be plugged in (default)
//   closed -> deiza.org installer edition: Deiza Omniscient only, no endpoint options
const argv = process.argv.slice(2);
const argValue = (flag, def) => { const i = argv.indexOf(flag); return i !== -1 && argv[i + 1] ? argv[i + 1] : def; };
const FLAVOR = argValue('--flavor', 'open') === 'closed' ? 'closed' : 'open';
const OUT = argValue('--out', FLAVOR === 'closed' ? 'dist/deiza-code-closed.js' : 'dist/deiza-code.js');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// Strip require('./...') and duplicate built-in requires and module.exports = ...
function cleanCode(code) {
  return code
    .replace(/^#!\/usr\/bin\/env node\s*/g, '')
    .replace(/const\s+(fs|path|os|http|https|crypto|readline)\s*=\s*require\(['"][^'"]+['"]\);?/g, '')
    .replace(/const\s+\{[^}]+\}\s*=\s*require\(['"]child_process['"]\);?/g, '')
    .replace(/const\s+\{[^}]+\}\s*=\s*require\(['"]\.\.?\/[^'"]+['"]\);?/g, '')
    .replace(/const\s+[^=]+\s*=\s*require\(['"]\.\.?\/[^'"]+['"]\);?/g, '')
    .replace(/module\.exports\s*=\s*\{[\s\S]*?\};?/g, '');
}

const header = `#!/usr/bin/env node

/**
 * DEIZA CODE — Autonomous Terminal Coding Agent
 * Official Standalone CLI Distribution (${FLAVOR === 'closed' ? 'Deiza Omniscient edition' : 'open edition'})
 * Powered by Deiza Omniscient (Deiza Liquid 5.1)
 * https://deiza.org
 */

'use strict';

const DEIZA_FLAVOR = '${FLAVOR}';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const readline = require('readline');
const { exec, spawn, execSync, execFileSync } = require('child_process');
`;

const uiCode = cleanCode(read('src/ui.js'));
const configCode = cleanCode(read('src/config.js'));
const sessionCode = cleanCode(read('src/session.js'));
const clipboardCode = cleanCode(read('src/clipboard.js'));
const contextCode = cleanCode(read('src/context.js'));
const toolsCode = cleanCode(read('src/tools.js'));
const promptCode = cleanCode(read('src/prompt.js'));
const agentCode = cleanCode(read('src/agent.js'));
const authCode = cleanCode(read('src/auth.js'));
const indexCode = cleanCode(read('src/index.js'));
const binCode = cleanCode(read('bin/deiza.js'));

const fullBundle = [
  header,
  '// ── 1. Configuration ──',
  configCode,
  '// ── 2. UI & Terminal Aesthetics ──',
  uiCode,
  '// ── 3. Session Persistence ──',
  sessionCode,
  '// ── 4. Clipboard & Image Detection ──',
  clipboardCode,
  '// ── 5. Workspace Context ──',
  contextCode,
  '// ── 6. Execution Tools ──',
  toolsCode,
  '// ── 7. System Prompt ──',
  promptCode,
  '// ── 8. Agent Engine & LLM Client ──',
  agentCode,
  '// ── 9. Authentication & Browser Flow ──',
  authCode,
  '// ── 10. Interactive REPL & Commands ──',
  indexCode,
  '// ── 11. Main Entrypoint ──',
  binCode,
].join('\n\n');

const bundlePath = path.resolve(ROOT, OUT);
fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
fs.writeFileSync(bundlePath, fullBundle, 'utf-8');
fs.chmodSync(bundlePath, 0o755);

console.log(`Bundled ${FLAVOR} edition to ${bundlePath} (${fs.statSync(bundlePath).size} bytes)`);

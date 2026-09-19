const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

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
 * Official Standalone CLI Distribution
 * Powered by Deiza Omniscient (Liquid 5.1) on Amazon AWS Compute Clusters
 * https://deiza.org
 */

'use strict';

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

const distDir = path.join(ROOT, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const bundlePath = path.join(distDir, 'deiza-code.js');
fs.writeFileSync(bundlePath, fullBundle, 'utf-8');
fs.chmodSync(bundlePath, 0o755);

console.log(`Bundled successfully to ${bundlePath} (${fs.statSync(bundlePath).size} bytes)`);

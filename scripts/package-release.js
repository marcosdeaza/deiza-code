const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DOWNLOADS = path.join(DIST, 'downloads');

fs.mkdirSync(DOWNLOADS, { recursive: true });

// 1. Build open bundle
execSync('node scripts/bundle.js --flavor open', { cwd: ROOT, stdio: 'inherit' });

// 2. Copy bundle to downloads
fs.copyFileSync(path.join(DIST, 'deiza-code.js'), path.join(DOWNLOADS, 'deiza-code.js'));
fs.chmodSync(path.join(DOWNLOADS, 'deiza-code.js'), 0o755);

// 3. Write version.json
const versionInfo = {
  version: "1.7.4",
  release_date: new Date().toISOString().split('T')[0],
  notes: "v1.7.4: Bucle autónomo continuo completo para Windows y todas las plataformas (hasta 120 rondas sin paradas prematuras), soporte para comando /upgrade como alias de /update, solución al reinicio automático tras actualización y pegado fiable de bloques de texto multilínea sin fragmentación en cola.",
  platforms: {
    darwin: "https://deiza.org/downloads/deiza-code.js",
    linux: "https://deiza.org/downloads/deiza-code.js",
    win32: "https://deiza.org/downloads/deiza-code.js"
  }
};
fs.writeFileSync(path.join(DOWNLOADS, 'version.json'), JSON.stringify(versionInfo, null, 2) + '\n', 'utf-8');

// 4. Create package staging directories
const staging = path.join(DIST, '.staging');
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const readme = 'DEIZA CODE - Autonomous Terminal Coding Agent\nhttps://deiza.org/code\n';
fs.writeFileSync(path.join(staging, 'README.txt'), readme, 'utf-8');
fs.copyFileSync(path.join(DOWNLOADS, 'deiza-code.js'), path.join(staging, 'deiza-code.js'));

// Windows zip
const winCmd = '@echo off\r\nnode "%~dp0deiza-code.js" %*\r\n';
fs.writeFileSync(path.join(staging, 'deiza.cmd'), winCmd, 'utf-8');
fs.writeFileSync(path.join(staging, 'deiza-code.cmd'), winCmd, 'utf-8');
execSync(`cd "${staging}" && zip -q "${path.join(DOWNLOADS, 'deiza-code-windows.zip')}" deiza.cmd deiza-code.cmd deiza-code.js README.txt`, { stdio: 'inherit' });

// Linux tar.gz
fs.rmSync(path.join(staging, 'deiza.cmd'), { force: true });
fs.rmSync(path.join(staging, 'deiza-code.cmd'), { force: true });
const unixLauncher = '#!/usr/bin/env bash\nexec node "$(dirname "$0")/deiza-code.js" "$@"\n';
fs.writeFileSync(path.join(staging, 'deiza'), unixLauncher, { mode: 0o755 });
execSync(`cd "${staging}" && tar -czf "${path.join(DOWNLOADS, 'deiza-code-linux.tar.gz')}" deiza deiza-code.js README.txt`, { stdio: 'inherit' });

// Darwin zip
execSync(`cd "${staging}" && zip -q "${path.join(DOWNLOADS, 'deiza-code-darwin.zip')}" deiza deiza-code.js README.txt`, { stdio: 'inherit' });

// Clean staging
fs.rmSync(staging, { recursive: true, force: true });

console.log('Successfully generated all release assets in dist/downloads:');
for (const f of fs.readdirSync(DOWNLOADS)) {
  const st = fs.statSync(path.join(DOWNLOADS, f));
  console.log(` - ${f} (${st.size} bytes)`);
}

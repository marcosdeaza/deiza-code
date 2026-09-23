/**
 * DEIZA CODE — Authentication & Account Integration
 * 1-click browser login through a local loopback listener, or manual API key entry.
 *
 * Every prompt goes through ONE readline interface: when the REPL is running its own
 * interface is reused, otherwise a temporary one is created and closed afterwards.
 * Two interfaces on the same stdin echo every keystroke twice ("11") and the REPL
 * would receive the answer as a chat message.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');
const { C, box } = require('./ui');
const { saveConfig, DEFAULT_DEIZA_API, isDeizaHost } = require('./config');

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const PREFERRED_PORT = 54321;

function openBrowser(url) {
  if (process.env.DEIZA_NO_BROWSER) return; // headless sessions / tests: the link is printed instead
  try {
    let child;
    if (process.platform === 'win32') {
      // Use rundll32 or PowerShell Start-Process which never open a console window
      // or misinterpret URL query parameters like &state=...
      try {
        child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
          detached: true, stdio: 'ignore', windowsHide: true,
        });
      } catch {
        child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`], {
          detached: true, stdio: 'ignore', windowsHide: true,
        });
      }
    } else if (process.platform === 'darwin') {
      child = spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
    child.on('error', () => {});
    child.unref();
  } catch {
    // The link is printed anyway; the user can open it by hand.
  }
}

function cleanKey(raw) {
  return String(raw || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
}

/**
 * Ask one line on the shared readline (or a temporary one). Supports an AbortSignal so a
 * pending question can be dropped when the browser callback wins the race.
 */
function askLine(query, { rl, signal } = {}) {
  const own = !rl;
  const iface = rl || readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  return new Promise((resolve, reject) => {
    // Lines that arrived while no question was pending (piped stdin, pasted blocks) are
    // queued by the interface owner in `__deizaQueue`; consume them first.
    const queue = iface.__deizaQueue;
    if (Array.isArray(queue) && queue.length) {
      process.stdout.write(query + queue[0] + '\n');
      if (own) iface.close();
      return resolve(queue.shift());
    }
    if (signal && signal.aborted) {
      if (own) iface.close();
      return reject(new Error('ABORTED'));
    }
    let done = false;
    const cleanup = () => {
      done = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      iface.removeListener('close', onClose);
      if (own) iface.close();
    };
    const onAbort = () => {
      if (done) return;
      try { iface.write(null, { ctrl: true, name: 'u' }); } catch {}
      cleanup();
      reject(new Error('ABORTED'));
    };
    const onClose = () => {
      if (done) return;
      cleanup();
      reject(new Error('Entrada cerrada antes de responder.'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    iface.once('close', onClose);
    try {
      iface.question(query, signal ? { signal } : undefined, (answer) => {
        if (done) return;
        cleanup();
        resolve(answer);
      });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

function jsonRequest(method, urlStr, { apiKey, body, timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      return resolve({ ok: false, status: 0, data: null, error: 'URL inválida' });
    }
    const client = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Accept': 'application/json', 'User-Agent': 'deiza-code' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['X-Api-Key'] = apiKey;
    }
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = client.request(url, { method, headers, timeout }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(raw); } catch { data = null; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data, raw });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => resolve({ ok: false, status: 0, data: null, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Account usage for an API key. Returns null when the key is not accepted or the
 * server is unreachable; `{plan: 'free', requires_upgrade: true}` for free accounts.
 */
async function fetchUsage(apiKey, accountBase = DEFAULT_DEIZA_API) {
  if (!apiKey) return null;
  const res = await jsonRequest('GET', `${accountBase}/api/code/usage`, { apiKey });
  if (res.status === 401 || res.status === 0 || !res.data) return null;
  if (!res.ok) return null;
  if (!res.data.plan) return null;
  return res.data;
}

async function fetchModels(apiKey, accountBase = DEFAULT_DEIZA_API) {
  const fallback = [
    { id: 'deiza-liquid', name: 'Deiza Liquid 5', description: 'Motor principal autónomo. Ventana de 256K tokens.' },
    { id: 'deiza-solid', name: 'Deiza Solid 4.6', description: 'Razonamiento profundo y arquitectura.' },
    { id: 'deiza-gas', name: 'Deiza Gas 4.5', description: 'Velocidad ultra-rápida y soporte multimodal.' },
    { id: 'deiza-vainilla', name: 'Deiza Vainilla', description: 'Modelo suave, conversacional y 100% ilimitado.' },
  ];
  const res = await jsonRequest('GET', `${accountBase}/api/code/models`, { apiKey, timeout: 5000 });
  if (res.ok && res.data && Array.isArray(res.data.models) && res.data.models.length) return res.data.models;
  return fallback;
}

/**
 * Validate an API key against the Deiza account server.
 */
async function validateApiKey(apiKey, accountBase = DEFAULT_DEIZA_API) {
  const key = cleanKey(apiKey);
  if (!key) return { valid: false, error: 'API Key requerida.' };
  const usage = await fetchUsage(key, accountBase);
  if (!usage) {
    return { valid: false, error: 'API Key inválida, revocada o no autorizada en deiza.org.' };
  }
  return {
    valid: true,
    plan: usage.plan || 'free',
    email: usage.email || '',
    name: usage.name || '',
    apiKey: key,
    usage,
  };
}

function applyLogin(currentConfig, check) {
  const newConfig = {
    ...currentConfig,
    apiKey: check.apiKey,
    email: check.email || 'Usuario Deiza',
    name: check.name || '',
    plan: check.plan || 'pro',
    loggedInAt: new Date().toISOString(),
  };
  saveConfig(newConfig);
  console.log(`\n  ${C.green}✓ Sesión iniciada.${C.reset} Cuenta: ${C.bold}${newConfig.email}${C.reset} · Plan: ${C.granateBold}[${String(newConfig.plan).toUpperCase()}]${C.reset}\n`);
  return newConfig;
}

const SUCCESS_PAGE = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Deiza Code conectado</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0a09;color:#f5f5f4;font-family:-apple-system,Segoe UI,Inter,sans-serif}
.card{max-width:420px;padding:40px 44px;border:1px solid #3f2a2d;border-radius:20px;background:#161213;text-align:center}
h1{font-size:22px;margin:0 0 10px;color:#e17080}p{color:#a8a29e;line-height:1.5;margin:0}code{color:#f5f5f4}</style></head>
<body><div class="card"><h1>Terminal conectada</h1><p>Deiza Code ya tiene acceso a tu cuenta.<br>Puedes cerrar esta pestaña y volver a la consola.</p></div>
<script>setTimeout(function(){try{window.close()}catch(e){}},1800)</script></body></html>`;

/**
 * 1-click browser login. Opens deiza.org/cli/auth, which posts the freshly minted key back
 * to http://127.0.0.1:<port>/callback. The user can also paste the key by hand meanwhile.
 */
function runBrowserOAuthFlow(currentConfig = {}, { rl } = {}) {
  const accountBase = isDeizaHost(currentConfig.accountBase) ? currentConfig.accountBase : DEFAULT_DEIZA_API;
  const state = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    let finished = false;
    let server = null;
    let timer = null;
    const abort = new AbortController();

    const finish = (err, cfg) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      abort.abort();
      // Keep the listener alive a while (unref'd so it never blocks exit): the web page may
      // ping the callback again or the user may click "open direct connection" later.
      try { server && server.unref(); } catch {}
      setTimeout(() => { try { server && server.close(); } catch {} }, 60000).unref();
      if (err) reject(err); else resolve(cfg);
    };

    server = http.createServer(async (req, res) => {
      let reqUrl;
      try {
        reqUrl = new URL(req.url, 'http://127.0.0.1');
      } catch {
        res.writeHead(400); res.end(); return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404); res.end(); return;
      }
      if (finished) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(SUCCESS_PAGE); return;
      }
      const gotState = reqUrl.searchParams.get('state') || '';
      const key = cleanKey(reqUrl.searchParams.get('key'));
      if (gotState !== state || !key) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Solicitud de autorización no válida. Vuelve a ejecutar /login en la terminal.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_PAGE);
      abort.abort(); // drop the manual-paste prompt before printing anything else
      console.log(`\n  ${C.gray}Clave recibida del navegador. Verificando con Deiza...${C.reset}`);
      const check = await validateApiKey(key, accountBase);
      if (check.valid) {
        finish(null, applyLogin(currentConfig, check));
      } else {
        finish(new Error(check.error || 'La clave recibida no es válida.'));
      }
    });

    const listen = (port) => new Promise((ok, fail) => {
      const onErr = (err) => { server.removeListener('listening', onOk); fail(err); };
      const onOk = () => { server.removeListener('error', onErr); ok(server.address().port); };
      server.once('error', onErr);
      server.once('listening', onOk);
      server.listen(port, '127.0.0.1');
    });

    (async () => {
      let port;
      try {
        port = await listen(PREFERRED_PORT);
      } catch {
        try { port = await listen(0); } catch (err) { return finish(new Error(`No se pudo abrir un puerto local: ${err.message}`)); }
      }
      const authUrl = `${accountBase}/cli/auth?port=${port}&state=${state}`;

      console.log(`\n${C.granateBold}Conectando con Deiza...${C.reset}`);
      console.log(`  ${C.white}Abriendo tu navegador para iniciar sesión.${C.reset}`);
      console.log(`  ${C.gray}Si no se abre, entra manualmente en:${C.reset}\n  ${C.granate}${authUrl}${C.reset}\n`);
      openBrowser(authUrl);

      timer = setTimeout(() => finish(new Error('Tiempo de espera agotado (5 min). Ejecuta /login para reintentar.')), LOGIN_TIMEOUT_MS);

      // Manual path in parallel: paste the key shown on the web page (SSH, remote desktops...)
      while (!finished) {
        let answer;
        try {
          answer = await askLine(`  ${C.rose}Pega aquí tu API Key si el navegador no conecta (o espera): ${C.reset}`, { rl, signal: abort.signal });
        } catch {
          return; // aborted: the browser callback already finished the login
        }
        if (finished) return;
        const key = cleanKey(answer);
        if (!key) continue;
        console.log(`  ${C.gray}Verificando API Key con Deiza...${C.reset}`);
        const check = await validateApiKey(key, accountBase);
        if (finished) return;
        if (check.valid) return finish(null, applyLogin(currentConfig, check));
        console.log(`  ${C.granateBright}✖ ${check.error}${C.reset}`);
        if (check.plan === 'free') return finish(new Error(check.error));
      }
    })();
  });
}

/**
 * Manual key input with backend verification (SSH, Docker, servers).
 */
async function fallbackManualLogin(currentConfig = {}, { rl } = {}) {
  const accountBase = isDeizaHost(currentConfig.accountBase) ? currentConfig.accountBase : DEFAULT_DEIZA_API;
  console.log(`\n  1. Abre en cualquier navegador: ${C.granate}${accountBase}/cli/auth${C.reset}`);
  console.log(`  2. Pulsa "Autorizar Deiza Code" y copia la clave (empieza por ${C.bold}dz_${C.reset})\n`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await askLine(`  ${C.granateBold}Pega tu API Key de Deiza: ${C.reset}`, { rl });
    const key = cleanKey(answer);
    if (!key) {
      console.log(`  ${C.gray}No se ha introducido ninguna clave.${C.reset}`);
      continue;
    }
    console.log(`  ${C.gray}Verificando API Key con Deiza...${C.reset}`);
    const check = await validateApiKey(key, accountBase);
    if (check.valid) return applyLogin(currentConfig, check);
    console.log(`  ${C.granateBright}✖ ${check.error}${C.reset}\n`);
    if (check.plan === 'free') throw new Error(check.error);
  }
  throw new Error('No se pudo verificar la API Key. Ejecuta /login para reintentar.');
}

/**
 * Interactive login: Browser (1) or API key (2).
 */
async function runLoginFlow(currentConfig = {}, { rl, reason } = {}) {
  if (reason) console.log(`\n  ${C.gold}${reason}${C.reset}`);
  console.log(`\n${C.granateDark}┌─ ${C.bold}${C.granateBright}Conectar Cuenta de Deiza${C.reset} ${C.granateDark}${'─'.repeat(31)}┐${C.reset}`);
  console.log(`  ${C.granateDark}│${C.reset}  ${C.bold}[1]${C.reset} ${C.white}Navegador Web${C.reset} ${C.gray}(Recomendado · 1 clic con tu sesión activa)${C.reset}`);
  console.log(`  ${C.granateDark}│${C.reset}  ${C.bold}[2]${C.reset} ${C.white}API Key Directa${C.reset} ${C.gray}(Terminales SSH, Docker o servidores)${C.reset}`);
  console.log(`${C.granateDark}└────────────────────────────────────────────────────────────┘${C.reset}`);

  const answer = await askLine(`  ${C.rose}Selecciona opción [1/2] (Enter para 1): ${C.reset}`, { rl });
  const choice = String(answer || '').trim();
  if (choice === '2') return fallbackManualLogin(currentConfig, { rl });
  return runBrowserOAuthFlow(currentConfig, { rl });
}

/**
 * Guarantee a valid, paid Deiza session before anything else runs. The saved key is
 * re-validated on every start: revoked keys or downgraded plans trigger a new login
 * instead of a cryptic API error later.
 */
async function ensureAuthenticated(cfg, { rl, force = false } = {}) {
  const accountBase = isDeizaHost(cfg.accountBase) ? cfg.accountBase : DEFAULT_DEIZA_API;
  if (!force && cfg.apiKey) {
    const usage = await fetchUsage(cfg.apiKey, accountBase);
    if (usage && usage.plan) {
      const updated = { ...cfg, plan: usage.plan, email: usage.email || cfg.email, name: usage.name || cfg.name, usage };
      if (updated.plan !== cfg.plan || updated.email !== cfg.email || updated.name !== cfg.name) saveConfig(updated);
      return updated;
    }
    // Server unreachable but a key exists: let the user in and validate lazily.
    const ping = await jsonRequest('GET', `${accountBase}/api/health`, { timeout: 4000 });
    if (!ping.ok && ping.status === 0) {
      console.log(`\n  ${C.gold}⚠ No se pudo contactar con deiza.org; se usará la sesión guardada.${C.reset}`);
      return cfg;
    }
    return runLoginFlow(cfg, { rl, reason: 'Tu sesión anterior ya no es válida. Inicia sesión de nuevo.' });
  }
  return runLoginFlow(cfg, { rl, reason: force ? undefined : 'Deiza Code necesita tu cuenta de Deiza para funcionar.' });
}

module.exports = {
  runLoginFlow,
  runBrowserOAuthFlow,
  fallbackManualLogin,
  ensureAuthenticated,
  validateApiKey,
  fetchModels,
  fetchUsage,
  askLine,
  openBrowser,
  jsonRequest,
};

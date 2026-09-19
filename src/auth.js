/**
 * DEIZA CODE — Authentication & Account Integration
 * 1-Click browser authentication via local loopback server or manual API key entry.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const readline = require('readline');
const { exec } = require('child_process');
const { C, box } = require('./ui');
const { saveConfig } = require('./config');

function openBrowser(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${start} "${url}"`, () => {});
}

/**
 * Validate an API key against Deiza backend
 */
async function validateApiKey(apiKey, apiBase = 'https://deiza.org') {
  if (!apiKey) return { valid: false, error: 'API Key requerida.' };
  if (!apiBase.includes('deiza.org')) {
    return { valid: true, plan: 'custom', email: 'Endpoint Personalizado' };
  }

  const usage = await fetchUsage(apiKey, apiBase);
  if (!usage) {
    return { valid: false, error: 'API Key inválida o no autorizada en deiza.org.' };
  }

  if (usage.plan === 'free') {
    return {
      valid: false,
      plan: 'free',
      error: 'Deiza Code requiere un plan de pago activo (Friend o Signet). Actualiza en https://deiza.org/plans',
    };
  }

  return {
    valid: true,
    plan: usage.plan,
    email: usage.email || 'Usuario Deiza',
    usage,
  };
}

/**
 * Runs 1-click browser login flow with local loopback listener
 */
async function runBrowserOAuthFlow(currentConfig = {}) {
  const state = crypto.randomBytes(16).toString('hex');
  const port = 54321;

  console.log(`\n${C.granateBold}Conectando con Deiza mediante Navegador...${C.reset}`);
  console.log(`  ${C.gray}Abriendo navegador para autorizar tu terminal...${C.reset}`);

  return new Promise((resolve, reject) => {
    let server;
    const authUrl = `${currentConfig.apiBase || 'https://deiza.org'}/cli/auth?port=${port}&state=${state}`;

    const cleanup = () => {
      if (server) {
        server.close();
        server = null;
      }
    };

    server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        if (reqUrl.pathname === '/callback') {
          const key = reqUrl.searchParams.get('key');
          const email = reqUrl.searchParams.get('email');
          const plan = reqUrl.searchParams.get('plan') || 'pro';

          if (!key) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: Clave no recibida</h1>');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0c0a09; color: #f5f5f5;">
                <h2 style="color: #b84a55;">✓ Terminal de Deiza Code Conectada</h2>
                <p style="color: #a8a29e;">Ya puedes volver a tu consola.</p>
                <script>setTimeout(() => window.close(), 1500);</script>
              </body>
            </html>
          `);

          cleanup();

          const newConfig = {
            ...currentConfig,
            apiKey: key,
            email: email || '',
            plan,
          };
          saveConfig(newConfig);

          console.log(`  ${C.green}✓ ¡Autenticación exitosa! Cuenta:${C.reset} ${C.bold}${email || 'Conectada'}${C.reset}\n`);
          resolve(newConfig);
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    server.on('error', (err) => {
      cleanup();
      console.log(`  ${C.gold}ℹ Servidor local no disponible. Modo manual:${C.reset}`);
      fallbackManualLogin(authUrl, currentConfig).then(resolve).catch(reject);
    });

    server.listen(port, '127.0.0.1', () => {
      openBrowser(authUrl);

      setTimeout(() => {
        if (server) {
          cleanup();
          console.log(`\n  ${C.gray}Tiempo de espera agotado. Puedes pegar tu clave manualmente:${C.reset}`);
          fallbackManualLogin(authUrl, currentConfig).then(resolve).catch(reject);
        }
      }, 180000);
    });
  });
}

/**
 * Manual key input flow with backend verification
 */
async function fallbackManualLogin(authUrl, currentConfig) {
  console.log(`\n  1. Abre este enlace en tu navegador: ${C.granate}${authUrl}${C.reset}`);
  console.log(`  2. Inicia sesión y copia tu API Key (empieza por "dz_")\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(`  ${C.granateBold}Pega tu API Key de Deiza: ${C.reset}`, async (key) => {
      rl.close();
      const trimmed = key.trim();
      if (!trimmed) {
        return reject(new Error('API Key requerida'));
      }

      console.log(`  ${C.gray}Verificando API Key con Deiza...${C.reset}`);
      const check = await validateApiKey(trimmed, currentConfig.apiBase);
      if (!check.valid) {
        return reject(new Error(check.error));
      }

      const newConfig = {
        ...currentConfig,
        apiKey: trimmed,
        email: check.email || 'Usuario Deiza',
        plan: check.plan || 'pro',
      };
      saveConfig(newConfig);
      console.log(`  ${C.green}✓ ¡API Key verificada y configurada con éxito!${C.reset}`);
      console.log(`  Cuenta: ${C.bold}${check.email}${C.reset} · Plan: ${C.granateBold}[${check.plan.toUpperCase()}]${C.reset}\n`);
      resolve(newConfig);
    });
  });
}

/**
 * Main login flow: interactive choice between Browser and API Key
 */
async function runLoginFlow(currentConfig = {}) {
  console.log(`\n${C.granateDark}┌─ ${C.bold}${C.granateBright}Conectar Cuenta de Deiza${C.reset} ${C.granateDark}${'─'.repeat(25)}┐${C.reset}`);
  console.log(`  ${C.granateDark}│${C.reset}  ${C.bold}[1]${C.reset} ${C.white}Navegador Web${C.reset} ${C.gray}(Recomendado · 1 Clic con tu sesión activa)${C.reset}`);
  console.log(`  ${C.granateDark}│${C.reset}  ${C.bold}[2]${C.reset} ${C.white}API Key Directa${C.reset} ${C.gray}(Para terminales SSH, Docker o Servidores)${C.reset}`);
  console.log(`${C.granateDark}└────────────────────────────────────────────────────────┘${C.reset}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.question(`  ${C.rose}Selecciona opción [1/2] (Enter para 1): ${C.reset}`, async (ans) => {
      rl.close();
      const choice = ans.trim();
      if (choice === '2') {
        const authUrl = `${currentConfig.apiBase || 'https://deiza.org'}/cli/auth`;
        fallbackManualLogin(authUrl, currentConfig).then(resolve).catch(reject);
      } else {
        runBrowserOAuthFlow(currentConfig).then(resolve).catch(reject);
      }
    });
  });
}

/**
 * Fetch authorized models from Deiza API
 */
async function fetchModels(apiKey, apiBase = 'https://deiza.org') {
  if (!apiBase.includes('deiza.org')) {
    // Custom OpenAI-compatible endpoint
    return [
      { id: 'default', name: 'Default Model', description: 'Modelo configurado en endpoint' }
    ];
  }

  return new Promise((resolve) => {
    const url = new URL(`${apiBase}/api/code/models`);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      url,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-Deiza-Key': apiKey,
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.models && Array.isArray(data.models)) {
              return resolve(data.models);
            }
          } catch {}
          resolve([
            { id: 'deiza-omniscient', name: 'Deiza Omniscient', description: 'Motor autónomo Liquid 5.1 en clusters dedicados AWS (Beta)' },
          ]);
        });
      }
    );

    req.on('error', () => {
      resolve([
        { id: 'deiza-omniscient', name: 'Deiza Omniscient', description: 'Motor autónomo Liquid 5.1 en clusters dedicados AWS (Beta)' },
      ]);
    });
    req.end();
  });
}

/**
 * Fetch account plan usage and 5h window status
 */
async function fetchUsage(apiKey, apiBase = 'https://deiza.org') {
  if (!apiBase.includes('deiza.org')) return null;

  return new Promise((resolve) => {
    const url = new URL(`${apiBase}/api/code/usage`);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      url,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-Deiza-Key': apiKey,
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.end();
  });
}

module.exports = {
  runLoginFlow,
  fallbackManualLogin,
  validateApiKey,
  fetchModels,
  fetchUsage,
};

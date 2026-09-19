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
  const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
  if (!cleanKey) return { valid: false, error: 'API Key requerida.' };
  if (!apiBase.includes('deiza.org')) {
    return { valid: true, plan: 'custom', email: 'Endpoint Personalizado', apiKey: cleanKey };
  }

  const usage = await fetchUsage(cleanKey, apiBase);
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
    apiKey: cleanKey,
    usage,
  };
}

/**
 * Runs 1-click browser login flow with local loopback listener
 */
async function runBrowserOAuthFlow(currentConfig = {}) {
  const state = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    let server = null;
    let rlPrompt = null;
    let isFinished = false;

    const cleanup = () => {
      isFinished = true;
      if (server) {
        try { server.close(); } catch {}
        server = null;
      }
      if (rlPrompt) {
        try { rlPrompt.close(); } catch {}
        rlPrompt = null;
      }
    };

    const finishSuccess = (cfgResult) => {
      if (isFinished) return;
      cleanup();
      resolve(cfgResult);
    };

    server = http.createServer((req, res) => {
      try {
        const assignedPort = server?.address()?.port || 54321;
        const reqUrl = new URL(req.url, `http://127.0.0.1:${assignedPort}`);
        if (reqUrl.pathname === '/callback') {
          const rawKey = reqUrl.searchParams.get('key') || '';
          const cleanKey = rawKey.trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
          const email = reqUrl.searchParams.get('email') || '';
          const plan = reqUrl.searchParams.get('plan') || 'pro';

          if (!cleanKey) {
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

          const newConfig = {
            ...currentConfig,
            apiKey: cleanKey,
            email: email || '',
            plan,
          };
          saveConfig(newConfig);

          console.log(`\n  ${C.green}✓ ¡Autenticación exitosa! Cuenta:${C.reset} ${C.bold}${email || 'Conectada'}${C.reset} · Plan: ${C.granateBold}[${plan.toUpperCase()}]${C.reset}\n`);
          finishSuccess(newConfig);
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    const startWithPort = (portToTry) => {
      server.listen(portToTry, '127.0.0.1', () => {
        const actualPort = server.address().port;
        const authUrl = `${currentConfig.apiBase || 'https://deiza.org'}/cli/auth?port=${actualPort}&state=${state}`;

        console.log(`\n${C.granateBold}Conectando con Deiza...${C.reset}`);
        console.log(`  ${C.white}Abriendo tu navegador para iniciar sesión...${C.reset}`);
        openBrowser(authUrl);

        console.log(`  ${C.gray}Enlace:${C.reset} ${C.granate}${authUrl}${C.reset}`);
        console.log(`  ${C.gray}(Si el navegador no conecta automáticamente, pega aquí tu clave generada)${C.reset}\n`);

        rlPrompt = readline.createInterface({ input: process.stdin, output: process.stdout });
        rlPrompt.question(`  ${C.rose}Pega tu API Key de Deiza (o presiona Enter si autorizaste en web): ${C.reset}`, async (ans) => {
          if (isFinished) return;
          const cleaned = (ans || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
          if (cleaned) {
            console.log(`  ${C.gray}Verificando API Key con Deiza...${C.reset}`);
            const check = await validateApiKey(cleaned, currentConfig.apiBase);
            if (check.valid) {
              const newConfig = {
                ...currentConfig,
                apiKey: cleaned,
                email: check.email || 'Usuario Deiza',
                plan: check.plan || 'pro',
              };
              saveConfig(newConfig);
              console.log(`  ${C.green}✓ ¡Autenticación exitosa! Cuenta:${C.reset} ${C.bold}${check.email}${C.reset} · Plan: ${C.granateBold}[${check.plan.toUpperCase()}]${C.reset}\n`);
              finishSuccess(newConfig);
            } else {
              console.log(`  ${C.granateBright}✖ ${check.error || 'Clave no válida'}${C.reset}\n`);
            }
          }
        });
      });
    };

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        try {
          server.removeAllListeners('error');
          server.on('error', () => {
            const fallbackUrl = `${currentConfig.apiBase || 'https://deiza.org'}/cli/auth`;
            fallbackManualLogin(fallbackUrl, currentConfig).then(finishSuccess).catch(reject);
          });
          startWithPort(0);
          return;
        } catch {}
      }
      const fallbackUrl = `${currentConfig.apiBase || 'https://deiza.org'}/cli/auth`;
      fallbackManualLogin(fallbackUrl, currentConfig).then(finishSuccess).catch(reject);
    });

    startWithPort(54321);

    setTimeout(() => {
      if (!isFinished) {
        cleanup();
        reject(new Error('Tiempo de espera agotado para la autorización.'));
      }
    }, 300000);
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
      const trimmed = (key || '').trim().replace(/^["']|["']$/g, '').replace(/[\r\n\t\s]/g, '');
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

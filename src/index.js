/**
 * DEIZA CODE — Interactive Terminal Coding Agent
 * Main REPL, Slash Commands, and Orchestration.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const readline = require('readline');
const { C, BANNER, Status, box, COMMANDS_REGISTRY, renderCommandPalette, renderWhoami, renderSessionList, renderSessionInfo } = require('./ui');
const { loadConfig, saveConfig, DEFAULT_MODEL, DEFAULT_DEIZA_API, VERSION } = require('./config');
const { runLoginFlow, fetchModels, fetchUsage, validateApiKey } = require('./auth');
const { runAgentTurn, streamCompletion } = require('./agent');
const { Tools } = require('./tools');
const { getGitContext, detectProjectType } = require('./context');
const { createSession, saveSession, loadSession, listSessions, getLatestSession, updateSessionTitleFromPrompt, deleteSession, addSessionTokens, findSessionId } = require('./session');
const { detectImageInText, getClipboardImage } = require('./clipboard');

async function checkLatestVersion() {
  return new Promise((resolve) => {
    const req = https.get('https://deiza.org/downloads/version.json', { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
  });
}

function runAutoUpdate() {
  return new Promise((resolve, reject) => {
    // If running as a standalone node script, attempt direct in-place update
    const targetScript = process.argv[1];
    if (targetScript && fs.existsSync(targetScript) && targetScript.endsWith('.js')) {
      const file = fs.createWriteStream(targetScript);
      https.get('https://deiza.org/downloads/deiza-code.js', (res) => {
        if (res.statusCode === 200) {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            try { fs.chmodSync(targetScript, 0o755); } catch (e) {}
            resolve('Actualización aplicada directamente.');
          });
        } else {
          fallbackInstaller(resolve, reject);
        }
      }).on('error', () => fallbackInstaller(resolve, reject));
      return;
    }
    fallbackInstaller(resolve, reject);
  });
}

function fallbackInstaller(resolve, reject) {
  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? 'powershell -ExecutionPolicy Bypass -Command "irm https://deiza.org/install.ps1 | iex"'
    : 'curl -fsSL https://deiza.org/install.sh | bash';

  exec(cmd, (err, stdout, stderr) => {
    if (err) return reject(new Error(stderr || err.message));
    resolve(stdout);
  });
}

async function startRepl(initialConfig) {
  let cfg = initialConfig;
  let currentMode = cfg.mode || 'build';

  console.clear();
  console.log(BANNER);

  // Fetch models if native deiza
  const models = await fetchModels(cfg.apiKey, cfg.apiBase);
  let activeModel = cfg.model || DEFAULT_MODEL;
  if (models.length > 0 && !models.some(m => m.id === activeModel)) {
    activeModel = models[0]?.id || activeModel;
  }
  cfg.model = activeModel;

  // Workspace Info
  const git = getGitContext();
  const projType = detectProjectType();
  const branchLabel = git.isGit ? ` · ${C.cyan}⎇ ${git.branch}${C.reset}` : '';

  // Usage info
  const usage = await fetchUsage(cfg.apiKey, cfg.apiBase);
  const plan = usage?.plan || cfg.plan || 'pro';
  const pct = usage && usage.token_limit > 0 ? Math.min(100, Math.round((usage.tokens_used / usage.token_limit) * 100)) : 0;
  const resetLabel = usage?.reset_in_seconds ? `${Math.ceil(usage.reset_in_seconds / 60)}m` : null;

  if (cfg.isCustomEndpoint) {
    console.log(`  ${C.white}Modo:${C.reset} ${C.gold}Endpoint Personalizado / OpenAI Compatible${C.reset}`);
    console.log(`  ${C.white}URL:${C.reset} ${C.gray}${cfg.apiBase}${C.reset}`);
  } else {
    if (plan === 'free') {
      console.log(`\n  ${C.granateBright}✖ Acceso restringido:${C.reset} Deiza Code requiere un plan de pago activo (${C.bold}Friend${C.reset} o ${C.bold}Signet${C.reset}).`);
      console.log(`  Actualiza tu suscripción en: ${C.white}https://deiza.org/plans${C.reset}\n`);
      process.exit(1);
    }
    console.log(`  ${C.white}Cuenta:${C.reset} ${C.bold}${cfg.email || 'Conectada'}${C.reset} · ${C.granateBold}[${plan.toUpperCase()}]${C.reset} · ${C.gray}Uso:${C.reset} ${pct}%${resetLabel ? ` (${resetLabel} restantes)` : ''}`);
  }

  const modelLabel = (!cfg.isCustomEndpoint && (activeModel.includes('omniscient') || activeModel.includes('liquid')))
    ? `${C.granateBright}Deiza Omniscient${C.reset} ${C.gray}[Liquid 5.1 · Amazon AWS Cluster] (BETA)${C.reset}`
    : `${C.granateBright}${activeModel}${C.reset}`;

  console.log(`  ${C.white}Modelo activo:${C.reset} ${modelLabel}`);
  console.log(`  ${C.white}Workspace:${C.reset} ${C.gray}${process.cwd()}${C.reset} [${projType}]${branchLabel}\n`);

  // Session Persistence for current workspace
  let activeSession = getLatestSession(process.cwd());
  const messages = [];

  if (activeSession && Array.isArray(activeSession.messages) && activeSession.messages.length > 0) {
    messages.push(...activeSession.messages);
    if (activeSession.mode) currentMode = activeSession.mode;
    console.log(`  ${C.rose}● Sesión persistente restaurada:${C.reset} ${C.white}${activeSession.title}${C.reset} ${C.darkGray}(${messages.length} mensajes guardados)${C.reset}`);
    console.log(`  ${C.gray}Usa ${C.white}/new${C.gray} para iniciar limpia o ${C.white}/history${C.gray} para ver sesiones anteriores.${C.reset}\n`);
  } else {
    activeSession = createSession(process.cwd(), currentMode);
  }

  console.log(`  ${C.gray}Escribe ${C.rose}/ ${C.gray}para ver comandos en tiempo real, o escribe tu consulta directamente.${C.reset}\n`);

  // Non-blocking background version check
  checkLatestVersion().then((remote) => {
    if (remote && remote.version) {
      const localVer = VERSION;
      if (remote.version !== localVer) {
        console.log(`\n  ${C.gold}🔔 Nueva versión de Deiza Code disponible: ${C.bold}v${remote.version}${C.reset} ${C.gray}(actual: v${localVer})${C.reset}. Ejecuta ${C.bold}/update${C.reset} para actualizar en 1 clic.\n`);
        rl.prompt(true);
      }
    }
  }).catch(() => {});

  const getPrompt = () => {
    const badge = currentMode === 'plan'
      ? `${C.cyan}[PLAN]${C.reset}`
      : `${C.rose}[BUILD]${C.reset}`;
    const curTokens = activeSession?.tokens?.total || 0;
    const tokLabel = curTokens >= 1000000
      ? `${(curTokens / 1000000).toFixed(2)}M`
      : curTokens >= 1000
        ? `${(curTokens / 1000).toFixed(1)}k`
        : `${curTokens}`;
    const pctLabel = curTokens > 0
      ? `${((curTokens / 1000000) * 100).toFixed(2)}%`
      : '0.0%';
    const contextBadge = `${C.darkGray}[${tokLabel}/1M · ${pctLabel}]${C.reset}`;
    return `${C.granateBold}deiza-code${C.reset} ${badge} ${contextBadge} ❯ `;
  };

  const slashCompleter = (line) => {
    if (line.startsWith('/')) {
      const hits = COMMANDS_REGISTRY.map(c => c.cmd).filter(c => c.startsWith(line));
      return [hits.length ? hits : COMMANDS_REGISTRY.map(c => c.cmd), line];
    }
    return [[], line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: slashCompleter,
    prompt: getPrompt(),
  });

  // Real-time keystroke listener: typing '/' on an empty line immediately renders command palette
  // Debounced to prevent corrupting paste streams in Windows CMD / PowerShell
  let keypressSlashTimer = null;
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.on('keypress', (str, key) => {
      if (str === '/' && rl.line === '') {
        if (keypressSlashTimer) clearTimeout(keypressSlashTimer);
        keypressSlashTimer = setTimeout(() => {
          if (rl.line === '/' || rl.line === '') {
            process.stdout.write('\n' + renderCommandPalette() + '\n');
            rl.prompt(true);
          }
        }, 120);
      } else if (keypressSlashTimer) {
        clearTimeout(keypressSlashTimer);
        keypressSlashTimer = null;
      }
    });
  }

  // Safe confirmation prompt helper
  const confirmAction = (promptText) => {
    return new Promise((resolve) => {
      rl.question(`  ${C.gold}⚠️  ${promptText}${C.reset}`, (answer) => {
        const a = answer.trim().toLowerCase();
        resolve(a === 'y' || a === 's' || a === 'yes' || a === 'si' || a === '');
      });
    });
  };

  rl.prompt();

  rl.on('line', async (line) => {
    const input = (line || '').replace(/\r/g, '').trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Slash Commands Handling
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '/' || cmd === '/help') {
        console.log(renderCommandPalette(parts[1] || ''));
        rl.prompt();
        return;
      }

      if (cmd === '/whoami') {
        const currentUsage = await fetchUsage(cfg.apiKey, cfg.apiBase);
        console.log(renderWhoami({
          email: cfg.email,
          plan: cfg.plan,
          apiKey: cfg.apiKey,
          apiBase: cfg.apiBase,
          usage: currentUsage,
          currentMode,
        }));
        rl.prompt();
        return;
      }

      if (cmd === '/session' || cmd === '/sessions' || cmd === '/history') {
        const sub = (parts[1] || 'list').toLowerCase();

        // 1. List sessions
        if (sub === 'list' || sub === 'ls') {
          const list = listSessions(process.cwd());
          console.log(renderSessionList(list, activeSession?.id));
          rl.prompt();
          return;
        }

        // 2. Create new session
        if (sub === 'new' || sub === 'create') {
          const title = parts.slice(2).join(' ').trim() || null;
          activeSession = createSession(process.cwd(), currentMode, title);
          messages.length = 0;
          console.log(`\n  ${C.green}✓ Nueva sesión creada e iniciada:${C.reset} ${C.bold}${activeSession.id}${C.reset}${title ? ` ("${title}")` : ''}\n`);
          rl.setPrompt(getPrompt());
          rl.prompt();
          return;
        }

        // 3. Resume / switch to session
        if (sub === 'resume' || sub === 'switch' || sub === 'open' || sub === 'load') {
          const targetId = parts[2];
          if (!targetId) {
            const list = listSessions(process.cwd());
            console.log(renderSessionList(list, activeSession?.id));
            rl.prompt();
            return;
          }
          const loaded = loadSession(targetId, process.cwd());
          if (loaded) {
            activeSession = loaded;
            messages.length = 0;
            if (Array.isArray(loaded.messages)) {
              messages.push(...loaded.messages);
            }
            if (loaded.mode) currentMode = loaded.mode;
            const tokStr = loaded.tokens?.total ? ` · ${C.gold}⚡ ${loaded.tokens.total.toLocaleString()} tokens consumidos${C.reset}` : '';
            console.log(`\n  ${C.green}✓ Sesión restaurada con éxito:${C.reset} ${C.bold}${loaded.title}${C.reset} ${C.gray}(${messages.length} msgs${tokStr})${C.reset}\n`);
            rl.setPrompt(getPrompt());
          } else {
            console.log(`\n  ${C.granateBright}✖ No se encontró la sesión con ID o coincidencia:${C.reset} ${targetId}\n`);
          }
          rl.prompt();
          return;
        }

        // 4. Delete session
        if (sub === 'delete' || sub === 'rm' || sub === 'drop') {
          const targetId = parts[2];
          if (!targetId) {
            console.log(`\n  ${C.rose}Uso:${C.reset} ${C.bold}/session delete <id_de_sesion>${C.reset}`);
            console.log(`  ${C.gray}Ejemplo: /session delete ses_20260919_7a1b (o parte del ID)${C.reset}\n`);
            rl.prompt();
            return;
          }
          const delRes = deleteSession(targetId, process.cwd());
          if (delRes.success) {
            console.log(`\n  ${C.green}✓ Sesión eliminada del disco:${C.reset} ${delRes.id}`);
            if (activeSession && activeSession.id === delRes.id) {
              activeSession = createSession(process.cwd(), currentMode);
              messages.length = 0;
              console.log(`  ${C.cyan}● Como era la sesión activa, se ha iniciado una nueva sesión limpia:${C.reset} ${activeSession.id}\n`);
            } else {
              console.log('');
            }
          } else {
            console.log(`\n  ${C.granateBright}✖ No se encontró la sesión para borrar:${C.reset} ${targetId}\n`);
          }
          rl.prompt();
          return;
        }

        // 5. Session Info & Tokens
        if (sub === 'info' || sub === 'stats' || sub === 'tokens' || sub === 'token') {
          console.log(renderSessionInfo(activeSession));
          rl.prompt();
          return;
        }

        // Direct /session <id> shortcut
        const trySession = loadSession(parts[1], process.cwd());
        if (trySession) {
          activeSession = trySession;
          messages.length = 0;
          if (Array.isArray(trySession.messages)) {
            messages.push(...trySession.messages);
          }
          if (trySession.mode) currentMode = trySession.mode;
          console.log(`\n  ${C.green}✓ Sesión reanudada:${C.reset} ${C.bold}${trySession.title}${C.reset} ${C.gray}(${messages.length} msgs)${C.reset}\n`);
          rl.setPrompt(getPrompt());
          rl.prompt();
          return;
        }

        console.log(`\n${C.granateBold}Gestor de Sesiones (/session):${C.reset}`);
        console.log(`  ${C.white}/session list${C.reset}              Ver todas las sesiones y consumo de tokens`);
        console.log(`  ${C.white}/session new [nombre]${C.reset}      Crear e iniciar una nueva sesión en limpio`);
        console.log(`  ${C.white}/session resume <id>${C.reset}       Cargar y reanudar una sesión guardada`);
        console.log(`  ${C.white}/session delete <id>${C.reset}       Borrar una sesión del almacenamiento local`);
        console.log(`  ${C.white}/session info${C.reset}              Ver desglose de tokens y métricas de la sesión actual\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/tokens' || cmd === '/context') {
        const curTokens = activeSession?.tokens || { prompt: 0, completion: 0, total: 0 };
        const maxTokens = 1000000;
        const total = curTokens.total || 0;
        const pct = ((total / maxTokens) * 100).toFixed(2);
        const remaining = Math.max(0, maxTokens - total);

        let content = '';
        content += `${C.white}Motor de Inferencia:${C.reset}     ${C.granateBright}deiza-omniscient${C.reset} ${C.gray}(Liquid 5.1 / Kimi K2.5 · AWS Dedicated)${C.reset}\n`;
        content += `${C.white}Ventana de Contexto:${C.reset}     ${C.bold}1,000,000 (1M)${C.reset} tokens nativos\n`;
        content += `${C.white}Tokens en Contexto:${C.reset}      ${C.bold}${C.green}${total.toLocaleString()}${C.reset} / 1,000,000 tokens (${pct}% ocupado)\n`;
        content += `${C.white}Capacidad Disponible:${C.reset}    ${C.bold}${remaining.toLocaleString()}${C.reset} tokens libres\n\n`;
        content += `${C.granateBright}── Desglose de la Sesión Activa (${activeSession?.id || 'sesión'}) ──${C.reset}\n`;
        content += `${C.white}• Prompt (Entrada):${C.reset}         ${C.gold}${curTokens.prompt.toLocaleString()}${C.reset} tokens\n`;
        content += `${C.white}• Completion (Salida):${C.reset}     ${C.gold}${curTokens.completion.toLocaleString()}${C.reset} tokens\n`;
        content += `${C.white}• Turnos en Memoria:${C.reset}       ${C.cyan}${messages.length}${C.reset} mensajes activos\n\n`;
        content += `${C.gray}Comandos rápidos: /clear (vaciar contexto actual) · /session new [nombre] · /usage (cuota 5h)${C.reset}`;

        console.log(box('Métricas de Contexto y Tokens (Ventana 1M)', content, C.granate));
        rl.prompt();
        return;
      }

      if (cmd === '/new') {
        const title = parts.slice(1).join(' ').trim() || null;
        activeSession = createSession(process.cwd(), currentMode, title);
        messages.length = 0;
        console.log(`\n  ${C.green}✓ Nueva conversación iniciada en limpio:${C.reset} ${C.bold}${activeSession.id}${C.reset}${title ? ` ("${title}")` : ''}\n`);
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/resume') {
        const targetId = parts[1];
        if (!targetId) {
          const list = listSessions(process.cwd());
          console.log(renderSessionList(list, activeSession?.id));
          rl.prompt();
          return;
        }
        const loaded = loadSession(targetId, process.cwd());
        if (loaded) {
          activeSession = loaded;
          messages.length = 0;
          if (Array.isArray(loaded.messages)) {
            messages.push(...loaded.messages);
          }
          if (loaded.mode) currentMode = loaded.mode;
          const tokStr = loaded.tokens?.total ? ` · ${C.gold}⚡ ${loaded.tokens.total.toLocaleString()} tokens${C.reset}` : '';
          console.log(`\n  ${C.green}✓ Conversación reanudada:${C.reset} ${C.bold}${loaded.title}${C.reset} ${C.gray}(${messages.length} mensajes cargados${tokStr})${C.reset}\n`);
          rl.setPrompt(getPrompt());
        } else {
          console.log(`\n  ${C.granateBright}✖ No se encontró la sesión:${C.reset} ${targetId}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/paste' || cmd === '/clipboard') {
        console.log(`\n  ${C.cyan}📋 Leyendo captura del portapapeles del sistema operativo...${C.reset}`);
        const clip = getClipboardImage();
        if (!clip.success) {
          console.log(`  ${C.gold}⚠️  ${clip.error || 'No se encontró imagen en el portapapeles.'}${C.reset}`);
          console.log(`  ${C.gray}Tip: Toma una captura con Win+Shift+S (Windows), Cmd+Shift+4 (Mac) o PrtScn y vuelve a escribir /paste.${C.reset}\n`);
          rl.prompt();
          return;
        }

        console.log(`  ${C.green}✓ Imagen del portapapeles capturada:${C.reset} ${clip.imagePath}`);
        const promptAfter = parts.slice(1).join(' ') || 'Analiza esta captura de pantalla y relaciónala con el código del proyecto.';

        rl.pause();
        try {
          const imgItem = {
            path: clip.imagePath,
            data_url: clip.dataUrl,
            size_bytes: fs.existsSync(clip.imagePath) ? fs.statSync(clip.imagePath).size : 0,
          };
          const turnResult = await runAgentTurn({
            cfg,
            messages,
            userInput: promptAfter,
            rl,
            confirmCallback: confirmAction,
            mode: currentMode,
            images: [imgItem],
          });
          updateSessionTitleFromPrompt(activeSession, promptAfter);
          activeSession.messages = messages;
          activeSession.mode = currentMode;
          if (turnResult?.usage) {
            addSessionTokens(activeSession, turnResult.usage);
          } else {
            saveSession(activeSession);
          }
        } catch (err) {
          console.log(Status.error(err.message));
        }
        rl.resume();
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/agent' || cmd === '/subagent') {
        const role = parts[1];
        const task = parts.slice(2).join(' ');
        if (!role || !task) {
          console.log(`\n  ${C.rose}Uso:${C.reset} ${C.bold}/agent <rol> <tarea>${C.reset}`);
          console.log(`  ${C.gray}Ejemplo: /agent Auditor "Analiza el archivo src/agent.js en busca de fugas"${C.reset}\n`);
          rl.prompt();
          return;
        }
        rl.pause();
        try {
          const result = await Tools.invoke_subagent({ role, task }, { cfg, streamCompletion });
          if (result.report) {
            console.log(`\n${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}`);
            console.log(result.report);
            console.log(`${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}\n`);
          }
        } catch (err) {
          console.log(Status.error(err.message));
        }
        rl.resume();
        rl.prompt();
        return;
      }

      if (cmd === '/config') {
        const key = parts[1]?.toLowerCase();
        const val = parts[2];
        if (key === 'endpoint' && val) {
          cfg.apiBase = val.replace(/\/+$/, '');
          cfg.isCustomEndpoint = !cfg.apiBase.includes('deiza.org');
          saveConfig(cfg);
          console.log(`  ${C.green}✓ Endpoint actualizado a:${C.reset} ${cfg.apiBase}\n`);
        } else if (key === 'mode' && (val === 'build' || val === 'plan')) {
          currentMode = val;
          cfg.defaultMode = val;
          saveConfig(cfg);
          console.log(`  ${C.green}✓ Modo por defecto guardado en ${val.toUpperCase()}${C.reset}\n`);
          rl.setPrompt(getPrompt());
        } else {
          console.log(`\n${C.granateDark}┌─ ${C.bold}${C.granateBright}Configuración Local Deiza Code${C.reset} ${C.granateDark}${'─'.repeat(25)}┐${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Ruta de configuración:${C.reset}  ${C.gray}~/.deiza/config.json${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Endpoint API:${C.reset}           ${C.gray}${cfg.apiBase}${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Modelo por defecto:${C.reset}     ${C.gray}${cfg.model}${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Modo actual:${C.reset}            ${currentMode === 'plan' ? `${C.cyan}[PLAN]` : `${C.rose}[BUILD]`}${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Cuenta conectada:${C.reset}       ${C.gray}${cfg.email || 'No iniciada'}${C.reset}`);
          console.log(`${C.granateDark}└────────────────────────────────────────────────────────────┘${C.reset}`);
          console.log(`  ${C.gray}Ajusta valores con: /config endpoint <url> o /config mode <build|plan>${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/update') {
        console.log(`\n  ${C.gray}Comprobando actualizaciones de Deiza Code...${C.reset}`);
        const remoteVer = await checkLatestVersion();
        const localVer = VERSION;

        if (!remoteVer) {
          console.log(`  ${C.gold}ℹ No se pudo contactar el servidor de versiones. Descargando instalador oficial...${C.reset}`);
        } else if (remoteVer.version === localVer) {
          console.log(`  ${C.green}✓ Ya estás en la versión más reciente de Deiza Code (v${localVer}).${C.reset}\n`);
          rl.prompt();
          return;
        } else {
          console.log(`  ${C.cyan}● Nueva versión detectada:${C.reset} ${C.white}v${localVer}${C.reset} ➜ ${C.bold}${C.green}v${remoteVer.version}${C.reset}`);
          if (remoteVer.notes) console.log(`  ${C.gray}Novedades: ${remoteVer.notes}${C.reset}`);
        }

        const approved = await confirmAction('¿Deseas descargar e instalar la actualización ahora? [S/n]: ');
        if (!approved) {
          console.log(`  ${C.gray}Actualización cancelada.${C.reset}\n`);
          rl.prompt();
          return;
        }

        console.log(`\n  ${C.granateBright}●${C.reset} ${C.white}Actualizando Deiza Code en tu sistema...${C.reset}`);
        rl.pause();
        try {
          await runAutoUpdate();
          console.log(`  ${C.green}✓ ¡Deiza Code actualizado con éxito!${C.reset}`);
          console.log(`  ${C.gray}Reinicia tu terminal o ejecuta 'deiza' para disfrutar de la nueva versión.${C.reset}\n`);
        } catch (err) {
          console.log(Status.error(`Error durante la actualización: ${err.message}`));
        }
        rl.resume();
        rl.prompt();
        return;
      }

      if (cmd === '/mode') {
        const target = (parts[1] || '').toLowerCase();
        if (target === 'plan') {
          currentMode = 'plan';
        } else if (target === 'build') {
          currentMode = 'build';
        } else {
          currentMode = currentMode === 'build' ? 'plan' : 'build';
        }
        const badge = currentMode === 'plan' ? `${C.cyan}[PLAN]${C.reset}` : `${C.rose}[BUILD]${C.reset}`;
        console.log(`  ${C.green}✓ Modo cambiado a ${badge}${C.reset}: ${currentMode === 'plan' ? 'Solo lectura, análisis y arquitectura.' : 'Implementación completa con edición de código.'}\n`);
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/plan') {
        currentMode = 'plan';
        console.log(`  ${C.cyan}● Modo PLAN activado:${C.reset} Análisis, inspección y arquitectura sin modificar archivos.\n`);
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/build') {
        currentMode = 'build';
        console.log(`  ${C.rose}● Modo BUILD activado:${C.reset} Edición quirúrgica de código, tests y ejecución de comandos.\n`);
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/image') {
        const imagePath = parts[1];
        if (!imagePath) {
          console.log(`\n  ${C.gray}Uso: /image <ruta_a_imagen> [instrucción opcional]${C.reset}\n`);
          rl.prompt();
          return;
        }
        const imgResult = await Tools.view_image({ path: imagePath });
        if (imgResult.error) {
          console.log(Status.error(imgResult.error));
          rl.prompt();
          return;
        }
        const promptAfterImage = parts.slice(2).join(' ') || 'Analiza esta imagen y describe las acciones arquitectónicas o de interfaz necesarias en el código.';
        console.log(`  ${C.cyan}👁 Imagen cargada:${C.reset} ${imagePath} (${Math.round(imgResult.size_bytes / 1024)} KB)`);

        rl.pause();
        try {
          const turnResult = await runAgentTurn({
            cfg,
            messages,
            userInput: promptAfterImage,
            rl,
            confirmCallback: confirmAction,
            mode: currentMode,
            images: [imgResult],
          });
          updateSessionTitleFromPrompt(activeSession, promptAfterImage);
          activeSession.messages = messages;
          activeSession.mode = currentMode;
          if (turnResult?.usage) {
            addSessionTokens(activeSession, turnResult.usage);
          } else {
            saveSession(activeSession);
          }
        } catch (err) {
          console.log(Status.error(err.message));
        }
        rl.resume();
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/model' || cmd === '/models') {
        const targetModel = parts[1]?.trim();
        if (!cfg.isCustomEndpoint) {
          if (targetModel) {
            const VALID_DEIZA_MODELS = ['deiza-omniscient'];
            if (!VALID_DEIZA_MODELS.includes(targetModel.toLowerCase())) {
              console.log(`\n  ${C.granateBright}✖ Modelo no válido:${C.reset} "${targetModel}"`);
              console.log(`  En el cluster nativo de Deiza, el único motor oficial disponible es: ${C.bold}deiza-omniscient${C.reset}`);
              console.log(`  ${C.gray}Motor: Liquid 5.1 / Kimi K2.5 · 1,000,000 (1M) Tokens de Context Window en AWS dedicado.${C.reset}`);
              console.log(`  ${C.gray}Para usar otros modelos locales o de terceros (OpenAI, Ollama, vLLM), configura un endpoint con: /endpoint <url>${C.reset}\n`);
              rl.prompt();
              return;
            } else {
              activeModel = 'deiza-omniscient';
              cfg.model = activeModel;
              saveConfig(cfg);
              console.log(`  ${C.green}✓ Modelo establecido en ${C.bold}${activeModel}${C.reset} (AWS Dedicated K2.5 · 1M Context Window)\n`);
              rl.prompt();
              return;
            }
          }
          console.log(`\n${C.granateBold}Motor Dedicado en Deiza Code:${C.reset}`);
          console.log(`  ${C.green}●${C.reset} ${C.bold}deiza-omniscient${C.reset} (Liquid 5.1 · Kimi K2.5 Architecture)`);
          console.log(`    ${C.gray}Infraestructura:${C.reset}   Amazon AWS Dedicated High-Compute Clusters`);
          console.log(`    ${C.gray}Ventana Contexto:${C.reset} 1,000,000 (1M) Tokens nativos`);
          console.log(`    ${C.gray}Especialidad:${C.reset}     Diffs quirúrgicos en línea, multiagentes y ejecución autónoma`);
          console.log(`    ${C.gray}Estado:${C.reset}           Motor exclusivo oficial en Deiza Code.\n`);
        } else {
          if (targetModel) {
            activeModel = targetModel;
            cfg.model = activeModel;
            saveConfig(cfg);
            console.log(`  ${C.green}✓ Modelo cambiado a ${C.bold}${activeModel}${C.reset}\n`);
          } else {
            console.log(`\n  ${C.gray}Usa: /model <id> para cambiar el modelo en tu endpoint custom.${C.reset}\n`);
          }
        }
        rl.prompt();
        return;
      }

      if (cmd === '/endpoint') {
        const targetEndpoint = parts[1];
        if (targetEndpoint) {
          cfg.apiBase = targetEndpoint.replace(/\/+$/, '');
          cfg.isCustomEndpoint = !cfg.apiBase.includes('deiza.org');
          saveConfig(cfg);
          console.log(`  ${C.green}✓ Endpoint actualizado a:${C.reset} ${cfg.apiBase}\n`);
        } else {
          console.log(`\n${C.granateBold}Configuración de Endpoint:${C.reset}`);
          console.log(`  Endpoint actual: ${C.white}${cfg.apiBase}${C.reset}`);
          console.log(`  Nativo Deiza:    https://deiza.org`);
          console.log(`  Ollama Local:    http://127.0.0.1:11434`);
          console.log(`  vLLM / LMStudio: http://127.0.0.1:8000\n`);
          console.log(`  ${C.gray}Usa: /endpoint <url> para cambiarlo.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/usage') {
        const currentUsage = await fetchUsage(cfg.apiKey, cfg.apiBase);
        if (!currentUsage) {
          console.log(`  ${C.gray}Endpoint personalizado o información de uso no disponible.${C.reset}\n`);
        } else {
          const usedPct = currentUsage.token_limit > 0
            ? Math.round((currentUsage.tokens_used / currentUsage.token_limit) * 100)
            : 0;
          const mins = currentUsage.reset_in_seconds ? Math.ceil(currentUsage.reset_in_seconds / 60) : 0;
          console.log(`\n${C.granateBold}Estado de Uso de tu Plan:${C.reset}`);
          console.log(`  Plan:              ${C.bold}${currentUsage.plan.toUpperCase()}${C.reset}`);
          console.log(`  Tokens utilizados: ${currentUsage.tokens_used.toLocaleString()} / ${currentUsage.token_limit.toLocaleString()} (${usedPct}%)`);
          console.log(`  Ventana de uso:    ${mins > 0 ? `Se reinicia en ${Math.floor(mins / 60)}h ${mins % 60}m` : '0% (se iniciará al enviar un mensaje)'}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/init') {
        const rulesPath = path.join(process.cwd(), '.deizarules');
        if (!fs.existsSync(rulesPath)) {
          const template = `# Directivas de Proyecto para Deiza Code\n\n- Mantener estilo limpio y modular.\n- Escribir tests para nuevas funciones.\n- Preferir TypeScript y tipado estricto.\n`;
          fs.writeFileSync(rulesPath, template, 'utf-8');
          console.log(`  ${C.green}✓ Creado archivo .deizarules en ${rulesPath}${C.reset}\n`);
        } else {
          console.log(`  ${C.gold}ℹ El archivo .deizarules ya existe en este proyecto.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/clear') {
        messages.length = 0;
        if (activeSession) {
          activeSession.messages = [];
          saveSession(activeSession);
        }
        console.clear();
        console.log(`  ${C.green}✓ Contexto de conversación limpiado.${C.reset}\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/login') {
        try {
          cfg = await runLoginFlow(cfg);
        } catch (err) {
          console.log(Status.error(err.message));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/logout') {
        cfg.apiKey = '';
        cfg.email = '';
        cfg.plan = 'free';
        saveConfig(cfg);
        console.log(`  ${C.green}✓ Sesión cerrada con éxito. Credenciales locales eliminadas de ~/.deiza/config.json${C.reset}\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/exit' || cmd === '/quit') {
        rl.close();
        return;
      }

      console.log(`  ${C.granateBright}Comando desconocido:${C.reset} ${cmd}. Escribe / para ver la lista de comandos disponibles.\n`);
      rl.prompt();
      return;
    }

    // Check if input contains an image file path (from CMD drag-and-drop or pasting "C:\path\img.png")
    const imgDetection = detectImageInText(input);
    let runImages = [];
    let effectiveInput = input;

    if (imgDetection.hasImage) {
      console.log(`  ${C.cyan}👁 Imagen detectada en el comando:${C.reset} ${imgDetection.imagePath}`);
      runImages.push({
        path: imgDetection.imagePath,
        data_url: imgDetection.dataUrl,
        size_bytes: fs.existsSync(imgDetection.imagePath) ? fs.statSync(imgDetection.imagePath).size : 0,
      });
      effectiveInput = imgDetection.promptText;
    }

    // Process user coding instruction
    rl.pause();
    try {
      const turnResult = await runAgentTurn({
        cfg,
        messages,
        userInput: effectiveInput,
        rl,
        confirmCallback: confirmAction,
        mode: currentMode,
        images: runImages,
      });
      updateSessionTitleFromPrompt(activeSession, effectiveInput);
      activeSession.messages = messages;
      activeSession.mode = currentMode;
      if (turnResult?.usage) {
        addSessionTokens(activeSession, turnResult.usage);
      } else {
        saveSession(activeSession);
      }
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') {
        console.log(Status.error('Tu sesión ha expirado o la clave es inválida. Ejecuta /login para reconectar.'));
      } else if (err.message === 'USAGE_LIMIT_EXCEEDED') {
        console.log(Status.error('Has alcanzado el límite de uso de tu plan. Consulta /usage para ver cuándo se reinicia.'));
      } else {
        console.log(Status.error(err.message));
      }
    }
    rl.resume();
    rl.setPrompt(getPrompt());
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.gray}Sesión finalizada.${C.reset}\n`);
    process.exit(0);
  });
}

module.exports = {
  startRepl,
};

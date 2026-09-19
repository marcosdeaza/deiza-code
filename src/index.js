/**
 * DEIZA CODE — Interactive Terminal Coding Agent
 * Main REPL, slash commands and orchestration.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, spawn } = require('child_process');
const readline = require('readline');
const { C, BANNER, Status, box, COMMANDS_REGISTRY, MODE_INFO, modeBadge, renderModes, renderCommandPalette, renderWhoami, renderSessionList, renderSessionInfo, renderCompactionCard, selectSessionInteractive } = require('./ui');
const { loadConfig, saveConfig, DEFAULT_MODEL, VERSION, MODES, IS_CLOSED, normalizeMode, normalizeUrl, isDeizaHost } = require('./config');
const { runLoginFlow, ensureAuthenticated, fetchModels, fetchUsage } = require('./auth');
const { runAgentTurn, streamCompletion, compactContext } = require('./agent');
const { Tools } = require('./tools');
const { getGitContext, detectProjectType } = require('./context');
const { createSession, saveSession, loadSession, listSessions, getLatestSession, updateSessionTitleFromPrompt, deleteSession, addSessionTokens, getActiveContextTokens } = require('./session');
const { detectImageInText, getClipboardImage } = require('./clipboard');

const UPDATE_BASE = 'https://deiza.org/downloads';

function restartSelf() {
  try {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      stdio: 'inherit',
      env: process.env,
      detached: false,
    });
    child.on('close', (code) => {
      process.exit(code || 0);
    });
    setTimeout(() => process.exit(0), 1200);
  } catch {
    process.exit(0);
  }
}

async function checkLatestVersion() {
  return new Promise((resolve) => {
    const req = https.get(`${UPDATE_BASE}/version.json`, { timeout: 2500 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

function isNewerVersion(remote, local) {
  const a = String(remote || '').split('.').map(n => parseInt(n, 10) || 0);
  const b = String(local || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

/**
 * Replace the running bundle in place (works for the installer layout on every OS);
 * falls back to the official installer when the file is not a bundle or not writable.
 */
function runAutoUpdate() {
  return new Promise((resolve, reject) => {
    const targetScript = process.argv[1];
    let isBundle = false;
    try {
      isBundle = !!targetScript && fs.existsSync(targetScript) && fs.readFileSync(targetScript, 'utf-8', { flag: 'r' }).slice(0, 400).includes('DEIZA CODE');
      if (isBundle) fs.accessSync(targetScript, fs.constants.W_OK);
    } catch {
      isBundle = false;
    }
    if (!isBundle) return fallbackInstaller(resolve, reject);

    const tmp = `${targetScript}.new`;
    const file = fs.createWriteStream(tmp);
    https.get(`${UPDATE_BASE}/deiza-code.js`, (res) => {
      if (res.statusCode !== 200) { res.resume(); file.close(); return fallbackInstaller(resolve, reject); }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmp, targetScript);
            try { fs.chmodSync(targetScript, 0o755); } catch {}
            resolve('Actualización aplicada directamente.');
          } catch (err) {
            fallbackInstaller(resolve, reject);
          }
        });
      });
    }).on('error', () => fallbackInstaller(resolve, reject));
  });
}

function fallbackInstaller(resolve, reject) {
  const isWin = process.platform === 'win32';
  const cmd = isWin
    ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://deiza.org/install.ps1 | iex"'
    : 'curl -fsSL https://deiza.org/install.sh | bash';
  exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
    if (err) return reject(new Error(stderr || err.message));
    resolve(stdout);
  });
}

function printHeader(cfg, currentMode, models) {
  const git = getGitContext();
  const projType = detectProjectType();
  const branchLabel = git.isGit ? ` · ${C.cyan}⎇ ${git.branch}${C.reset}` : '';
  const usage = cfg.usage;
  const plan = usage?.plan || cfg.plan || 'pro';
  const pct = usage && usage.token_limit > 0 ? Math.min(100, Math.round((usage.tokens_used / usage.token_limit) * 100)) : 0;
  const resetLabel = usage?.reset_in_seconds ? `${Math.ceil(usage.reset_in_seconds / 60)}m` : null;

  console.log(`  ${C.white}Cuenta:${C.reset} ${C.bold}${cfg.name ? `${cfg.name} · ` : ''}${cfg.email || 'Conectada'}${C.reset} · ${C.granateBold}[${String(plan).toUpperCase()}]${C.reset} · ${C.gray}Uso:${C.reset} ${pct}%${resetLabel ? ` (${resetLabel} para reiniciar)` : ''}`);
  if (cfg.isCustomEndpoint) {
    console.log(`  ${C.white}Motor:${C.reset} ${C.gold}Endpoint personalizado${C.reset} ${C.gray}${cfg.apiBase}${C.reset} · ${C.white}Modelo:${C.reset} ${C.granateBright}${cfg.model}${C.reset}`);
  } else {
    const label = (cfg.model.includes('omniscient') || cfg.model.includes('liquid'))
      ? `${C.granateBright}Deiza Omniscient${C.reset} ${C.gray}[Deiza Liquid 5.1 · infraestructura dedicada]${C.reset}`
      : `${C.granateBright}${cfg.model}${C.reset}`;
    console.log(`  ${C.white}Motor:${C.reset} ${label}`);
  }
  console.log(`  ${C.white}Modo:${C.reset} ${modeBadge(currentMode)} ${C.gray}${(MODE_INFO[currentMode] || MODE_INFO.build).desc}${C.reset}`);
  console.log(`  ${C.white}Workspace:${C.reset} ${C.gray}${process.cwd()}${C.reset} [${projType}]${branchLabel}\n`);
}

async function startRepl(initialConfig) {
  let cfg = initialConfig;
  let currentMode = normalizeMode(cfg.mode || cfg.defaultMode);

  console.clear();
  console.log(BANNER);

  // Model list only matters for the native engine; a custom endpoint keeps whatever the user set.
  if (!cfg.isCustomEndpoint) {
    const models = await fetchModels(cfg.apiKey, cfg.accountBase);
    if (models.length > 0 && !models.some(m => m.id === cfg.model)) cfg.model = models[0].id || DEFAULT_MODEL;
  } else if (!cfg.model || cfg.model === DEFAULT_MODEL) {
    cfg.model = cfg.endpointModel || 'default';
  }

  printHeader(cfg, currentMode);

  // Session persistence for the current workspace
  let activeSession = getLatestSession(process.cwd());
  const messages = [];

  if (activeSession && Array.isArray(activeSession.messages) && activeSession.messages.length > 0) {
    messages.push(...activeSession.messages);
    const ctxTokens = getActiveContextTokens(messages);
    const tokLabel = ctxTokens >= 1000000
      ? `${(ctxTokens / 1000000).toFixed(2)}M`
      : ctxTokens >= 1000 ? `${(ctxTokens / 1000).toFixed(1)}k` : `${ctxTokens}`;
    const pctLabel = ((ctxTokens / 1000000) * 100).toFixed(2);
    console.log(`  ${C.rose}● Sesión persistente restaurada:${C.reset} ${C.white}${activeSession.title}${C.reset} ${C.gray}(${messages.length} mensajes · ${C.gold}${tokLabel} tokens en contexto activo${C.gray} [${pctLabel}% del 1M])${C.reset}`);
    console.log(`  ${C.gray}Usa ${C.white}/new${C.gray} para iniciar limpia, ${C.white}/session${C.gray} para cambiar o ${C.white}/compact${C.gray} para comprimir memoria.${C.reset}\n`);
  } else {
    activeSession = createSession(process.cwd(), currentMode);
  }

  console.log(`  ${C.gray}Escribe ${C.rose}/ ${C.gray}para ver comandos, o escribe tu petición directamente. ${C.darkGray}Esc interrumpe una petición en curso.${C.reset}\n`);

  const getPrompt = () => {
    const curTokens = getActiveContextTokens(messages);
    const tokLabel = curTokens >= 1000000
      ? `${(curTokens / 1000000).toFixed(2)}M`
      : curTokens >= 1000 ? `${(curTokens / 1000).toFixed(1)}k` : `${curTokens}`;
    const pctLabel = curTokens > 0 ? `${((curTokens / 1000000) * 100).toFixed(2)}%` : '0.0%';
    const contextBadge = `${C.darkGray}[${tokLabel}/1M · ${pctLabel}]${C.reset}`;
    return `${C.granateBold}deiza-code${C.reset} ${modeBadge(currentMode)} ${contextBadge} ❯ `;
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
    terminal: process.stdin.isTTY,
  });

  // Startup lightweight update check (< 2s) with interactive prompt and instant restart
  try {
    const remote = await checkLatestVersion();
    if (remote && remote.version && isNewerVersion(remote.version, VERSION)) {
      console.log(`  ${C.gold}● Actualización disponible: ${C.bold}v${remote.version}${C.reset} ${C.gray}(instalada: v${VERSION})${C.reset}`);
      if (remote.notes) console.log(`  ${C.gray}Novedades: ${remote.notes}${C.reset}`);
      const shouldUpdate = await new Promise((resolve) => {
        rl.question(`  ${C.roseBold}¿Deseas actualizar ahora a la v${remote.version} automáticamente? [S/n]: ${C.reset}`, (ans) => {
          const a = String(ans || '').trim().toLowerCase();
          resolve(a === '' || a === 's' || a === 'si' || a === 'sí' || a === 'y' || a === 'yes');
        });
      });
      if (shouldUpdate) {
        console.log(`\n  ${C.granateBright}●${C.reset} ${C.white}Descargando e instalando actualización...${C.reset}`);
        try {
          await runAutoUpdate();
          console.log(`  ${C.green}✓ Deiza Code actualizado con éxito.${C.reset}`);
          console.log(`  ${C.cyan}↻ Reiniciando Deiza Code en la nueva versión...${C.reset}\n`);
          restartSelf();
          return;
        } catch (err) {
          console.log(Status.error(`Error en auto-actualización: ${err.message}`));
        }
      } else {
        console.log(`  ${C.gray}Continuando con la versión actual (puedes actualizar después con /update).${C.reset}\n`);
      }
    }
  } catch {}

  // Typing '/' on an empty line shows the command palette (debounced so pastes are not corrupted)
  let keypressSlashTimer = null;
  let busy = false; // while the agent or a login prompt runs, the palette stays quiet
  const inputQueue = [];

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin, rl);
    process.stdin.on('keypress', (str, key) => {
      if (busy) {
        if (key && key.name === 'escape' && abortCtl) abortCtl.abort();
        return;
      }

      // Check for Ctrl+V image paste from clipboard
      if ((key && key.ctrl && key.name === 'v') || str === '\x16') {
        const clip = getClipboardImage();
        if (clip.success && clip.imagePath) {
          const base = path.basename(clip.imagePath);
          const tag = `[image: ${base}]`;
          rl.write(tag + ' ');
          process.stdout.write(`\n  ${C.cyan}› [image: ${base}]${C.reset} ${C.gray}(pegada del portapapeles)${C.reset}\n`);
          rl.prompt(true);
          return;
        }
      }

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

  const confirmAction = (promptText) => new Promise((resolve) => {
    rl.question(`  ${C.gold}⚠ ${promptText}${C.reset}`, (answer) => {
      const a = String(answer || '').trim().toLowerCase();
      resolve(a === 'y' || a === 's' || a === 'yes' || a === 'si' || a === 'sí' || a === '');
    });
  });

  const setMode = (mode, { persist = false } = {}) => {
    currentMode = normalizeMode(mode);
    if (activeSession) { activeSession.mode = currentMode; saveSession(activeSession); }
    if (persist) { cfg.defaultMode = currentMode; saveConfig(cfg); }
    const info = MODE_INFO[currentMode];
    console.log(`  ${C.green}✓ Modo ${modeBadge(currentMode)}${C.reset} ${C.gray}${info.desc}${persist ? ' (guardado por defecto)' : ''}${C.reset}\n`);
    rl.setPrompt(getPrompt());
  };

  // Runs one agent request with the terminal in "busy" state. Esc / Ctrl+C interrupt it.
  let abortCtl = null;
  const runTurn = async (input, images = []) => {
    busy = true;
    abortCtl = new AbortController();
    try {
      const turnResult = await runAgentTurn({
        cfg,
        messages,
        userInput: input,
        confirmCallback: confirmAction,
        mode: currentMode,
        images,
        signal: abortCtl.signal,
        onToolModeChange: () => saveConfig(cfg),
      });
      updateSessionTitleFromPrompt(activeSession, input);
      activeSession.messages = messages;
      activeSession.mode = currentMode;
      if (turnResult?.usage) addSessionTokens(activeSession, turnResult.usage, messages);
      else saveSession(activeSession);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg === 'ABORTED') {
        console.log(`\n  ${C.gold}■ Petición interrumpida.${C.reset}\n`);
        activeSession.messages = messages;
        saveSession(activeSession);
      } else if (msg === 'AUTH_EXPIRED') {
        console.log(Status.error('Tu sesión ha expirado o la clave fue revocada.'));
        await doLogin(true);
      } else if (msg === 'PLAN_REQUIRED') {
        console.log(Status.error('Deiza Code requiere un plan de pago activo (Friend o Signet): https://deiza.org/plans'));
      } else if (msg === 'USAGE_LIMIT_EXCEEDED') {
        console.log(Status.error('Has alcanzado el límite de uso de tu plan. Consulta /usage para ver cuándo se reinicia.'));
      } else {
        console.log(Status.error(msg));
      }
      // Drop the dangling user message so a retry does not duplicate it
      if (msg !== 'ABORTED' && messages.length && messages[messages.length - 1].role === 'user') messages.pop();
    } finally {
      busy = false;
      abortCtl = null;

      // Drain inputQueue if user submitted commands/instructions while agent was working
      if (inputQueue.length > 0) {
        setImmediate(async () => {
          while (inputQueue.length > 0) {
            const nextInput = inputQueue.shift();
            console.log(`\n  ${C.roseBold}❯ Ejecutando desde cola:${C.reset} ${C.white}${nextInput}${C.reset}`);
            await runTurn(nextInput);
          }
          rl.setPrompt(getPrompt());
          rl.prompt();
        });
      }
    }
  };

  const doLogin = async (force) => {
    busy = true;
    try {
      cfg = await ensureAuthenticated(cfg, { rl, force });
      console.log(`  ${C.gray}Cuenta activa: ${C.white}${cfg.email}${C.gray} · plan ${C.white}${String(cfg.plan).toUpperCase()}${C.reset}\n`);
    } catch (err) {
      if (err?.message === 'PLAN_REQUIRED') { rl.close(); process.exit(1); }
      console.log(Status.error(err.message));
    } finally {
      busy = false;
    }
  };

  // Non-blocking background version check
  checkLatestVersion().then((remote) => {
    if (remote && remote.version && isNewerVersion(remote.version, VERSION) && !busy) {
      console.log(`\n  ${C.gold}Nueva versión de Deiza Code disponible: ${C.bold}v${remote.version}${C.reset} ${C.gray}(actual: v${VERSION})${C.reset}. Ejecuta ${C.bold}/update${C.reset} para actualizar.\n`);
      rl.prompt(true);
    }
  }).catch(() => {});

  rl.prompt();

  rl.on('line', async (line) => {
    const input = (line || '').replace(/\r/g, '').trim();
    if (!input) {
      if (!busy) rl.prompt();
      return;
    }

    if (busy) {
      // User typed while agent is working!
      if (input === '/abort' || input === '/cancel' || input === 'q') {
        if (abortCtl) {
          console.log(`\n  ${C.gold}■ Interrumpiendo tarea en curso...${C.reset}`);
          abortCtl.abort();
        }
        return;
      }
      if (input === '/' || input === '/help') {
        console.log(`\n  ${C.granateBold}Comandos durante la ejecución:${C.reset}`);
        console.log(`    ${C.gold}Esc / /abort${C.reset}   Interrumpir la tarea actual`);
        console.log(`    ${C.white}Texto...${C.reset}       Se añade a la cola para ejecutarse al terminar\n`);
        return;
      }
      inputQueue.push(input);
      console.log(`  ${C.rose}› [en cola #${inputQueue.length}]:${C.reset} "${input.length > 55 ? input.slice(0, 52) + '...' : input}" ${C.gray}(se ejecutará al terminar)${C.reset}`);
      return;
    }

    if (input.startsWith('/')) {
      const parts = input.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      if (cmd === '/' || cmd === '/help') {
        console.log(renderCommandPalette(parts[1] || ''));
        console.log(renderModes(currentMode));
        rl.prompt();
        return;
      }

      if (cmd === '/build' || cmd === '/copilot' || cmd === '/plan') {
        setMode(cmd.slice(1));
        const rest = parts.slice(1).join(' ').trim();
        if (rest) { await runTurn(rest); rl.setPrompt(getPrompt()); }
        rl.prompt();
        return;
      }

      if (cmd === '/mode') {
        const target = (parts[1] || '').toLowerCase();
        if (MODES.includes(target)) setMode(target);
        else console.log(renderModes(currentMode));
        rl.prompt();
        return;
      }

      if (cmd === '/whoami') {
        const currentUsage = await fetchUsage(cfg.apiKey, cfg.accountBase);
        console.log(renderWhoami({
          email: cfg.email, name: cfg.name, plan: currentUsage?.plan || cfg.plan, apiKey: cfg.apiKey,
          apiBase: cfg.apiBase, isCustom: cfg.isCustomEndpoint, usage: currentUsage, currentMode,
        }));
        rl.prompt();
        return;
      }

      if (cmd === '/session' || cmd === '/sessions' || cmd === '/history' || cmd === '/resume') {
        const sub = (parts[1] || '').toLowerCase();

        // If invoked without argument (e.g. /session or /resume), launch the interactive arrow-key selector!
        if (!sub || (cmd === '/resume' && !parts[1])) {
          const sessions = listSessions(process.cwd());
          if (sessions.length === 0) {
            console.log(`\n  ${C.gray}No hay conversaciones previas en este workspace. Usa ${C.white}/session new${C.gray} para crear una.${C.reset}\n`);
            rl.prompt();
            return;
          }

          rl.pause();
          const chosen = await selectSessionInteractive(sessions, activeSession?.id);
          rl.resume();

          if (!chosen) {
            console.log(`  ${C.gray}Selección cancelada.${C.reset}\n`);
          } else if (chosen.type === 'new') {
            activeSession = createSession(process.cwd(), currentMode);
            messages.length = 0;
            console.log(`\n  ${C.green}✓ Nueva sesión iniciada:${C.reset} ${C.bold}${activeSession.id}${C.reset}\n`);
          } else if (chosen.id) {
            const loaded = loadSession(chosen.id, process.cwd());
            if (loaded) {
              activeSession = loaded;
              messages.length = 0;
              if (Array.isArray(loaded.messages)) messages.push(...loaded.messages);
              if (loaded.mode) currentMode = normalizeMode(loaded.mode);
              const ctxTokens = getActiveContextTokens(messages);
              console.log(`\n  ${C.green}✓ Sesión cargada:${C.reset} ${C.bold}${loaded.title}${C.reset} ${C.gray}(${messages.length} msgs · ${ctxTokens.toLocaleString()} tokens en contexto)${C.reset}\n`);
            }
          }
          rl.setPrompt(getPrompt());
          rl.prompt();
          return;
        }

        if (sub === 'list' || sub === 'ls') {
          console.log(renderSessionList(listSessions(process.cwd()), activeSession?.id));
          rl.prompt();
          return;
        }
        if (sub === 'new' || sub === 'create') {
          const title = parts.slice(2).join(' ').trim() || null;
          activeSession = createSession(process.cwd(), currentMode, title);
          messages.length = 0;
          console.log(`\n  ${C.green}✓ Nueva sesión creada e iniciada:${C.reset} ${C.bold}${activeSession.id}${C.reset}${title ? ` ("${title}")` : ''}\n`);
          rl.setPrompt(getPrompt());
          rl.prompt();
          return;
        }
        if (sub === 'resume' || sub === 'switch' || sub === 'open' || sub === 'load' || sub === 'info' || sub === 'stats' || sub === 'tokens' || sub === 'token' || sub === 'delete' || sub === 'rm' || sub === 'drop') {
          if (sub === 'info' || sub === 'stats' || sub === 'tokens' || sub === 'token') {
            console.log(renderSessionInfo(activeSession));
            rl.prompt();
            return;
          }
          const targetId = parts[2];
          if (sub === 'delete' || sub === 'rm' || sub === 'drop') {
            if (!targetId) {
              console.log(`\n  ${C.rose}Uso:${C.reset} ${C.bold}/session delete <id_de_sesion>${C.reset}\n`);
              rl.prompt();
              return;
            }
            const delRes = deleteSession(targetId, process.cwd());
            if (delRes.success) {
              console.log(`\n  ${C.green}✓ Sesión eliminada del disco:${C.reset} ${delRes.id}`);
              if (activeSession && activeSession.id === delRes.id) {
                activeSession = createSession(process.cwd(), currentMode);
                messages.length = 0;
                console.log(`  ${C.cyan}● Era la sesión activa: se ha iniciado una nueva sesión limpia:${C.reset} ${activeSession.id}\n`);
              } else {
                console.log('');
              }
            } else {
              console.log(`\n  ${C.granateBright}✖ No se encontró la sesión:${C.reset} ${targetId}\n`);
            }
            rl.prompt();
            return;
          }
          if (!targetId) {
            console.log(renderSessionList(listSessions(process.cwd()), activeSession?.id));
            rl.prompt();
            return;
          }
          const loaded = loadSession(targetId, process.cwd());
          if (loaded) {
            activeSession = loaded;
            messages.length = 0;
            if (Array.isArray(loaded.messages)) messages.push(...loaded.messages);
            if (loaded.mode) currentMode = normalizeMode(loaded.mode);
            const tokStr = loaded.tokens?.total ? ` · ${C.gold}${loaded.tokens.total.toLocaleString()} tokens consumidos${C.reset}` : '';
            console.log(`\n  ${C.green}✓ Sesión restaurada:${C.reset} ${C.bold}${loaded.title}${C.reset} ${C.gray}(${messages.length} msgs${tokStr})${C.reset}\n`);
            rl.setPrompt(getPrompt());
          } else {
            console.log(`\n  ${C.granateBright}✖ No se encontró la sesión:${C.reset} ${targetId}\n`);
          }
          rl.prompt();
          return;
        }
        const trySession = loadSession(parts[1], process.cwd());
        if (trySession) {
          activeSession = trySession;
          messages.length = 0;
          if (Array.isArray(trySession.messages)) messages.push(...trySession.messages);
          if (trySession.mode) currentMode = normalizeMode(trySession.mode);
          console.log(`\n  ${C.green}✓ Sesión reanudada:${C.reset} ${C.bold}${trySession.title}${C.reset} ${C.gray}(${messages.length} msgs)${C.reset}\n`);
          rl.setPrompt(getPrompt());
          rl.prompt();
          return;
        }
        console.log(`\n${C.granateBold}Gestor de Sesiones (/session):${C.reset}`);
        console.log(`  ${C.white}/session${C.reset}                   Selector interactivo con flechas [↑/↓]`);
        console.log(`  ${C.white}/session list${C.reset}              Ver todas las sesiones y consumo de tokens`);
        console.log(`  ${C.white}/session new [nombre]${C.reset}      Crear e iniciar una nueva sesión en limpio`);
        console.log(`  ${C.white}/session resume <id>${C.reset}       Cargar y reanudar una sesión guardada`);
        console.log(`  ${C.white}/session delete <id>${C.reset}       Borrar una sesión del almacenamiento local`);
        console.log(`  ${C.white}/session info${C.reset}              Ver desglose de tokens de la sesión actual\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/tokens' || cmd === '/context') {
        const activeContext = getActiveContextTokens(messages);
        const maxTokens = 1000000;
        const pct = ((activeContext / maxTokens) * 100).toFixed(2);
        const remaining = Math.max(0, maxTokens - activeContext);
        const sessionConsumed = activeSession?.tokens?.total || 0;

        let content = '';
        content += `${C.white}Motor de Inferencia:${C.reset}     ${C.granateBright}${cfg.isCustomEndpoint ? cfg.model : 'deiza-omniscient'}${C.reset} ${cfg.isCustomEndpoint ? `${C.gray}(${cfg.apiBase})${C.reset}` : `${C.gray}(Liquid 5.1 / Kimi K2.5 · AWS Cluster)${C.reset}`}\n`;
        content += `${C.white}Ventana de Contexto:${C.reset}     ${C.bold}1,000,000 (1M)${C.reset} tokens nativos\n`;
        content += `${C.white}Contexto Activo en Memoria:${C.reset} ${C.bold}${C.green}${activeContext.toLocaleString()}${C.reset} / 1,000,000 tokens (${pct}% ocupado)\n`;
        content += `${C.white}Capacidad Libre Ventana:${C.reset}   ${C.bold}${remaining.toLocaleString()}${C.reset} tokens disponibles\n\n`;
        content += `${C.granateBright}── Métricas de la Sesión (${activeSession?.id || 'sin sesión'}) ──${C.reset}\n`;
        content += `${C.white}• Mensajes en Historial:${C.reset}   ${messages.length} mensajes guardados\n`;
        content += `${C.white}• Tokens Consumidos:${C.reset}       ${C.gold}${sessionConsumed.toLocaleString()}${C.reset} tokens facturados acumulados\n`;
        content += `${C.white}• Prompt (Entrada):${C.reset}        ${(activeSession?.tokens?.prompt || 0).toLocaleString()} tokens\n`;
        content += `${C.white}• Completion (Salida):${C.reset}    ${(activeSession?.tokens?.completion || 0).toLocaleString()} tokens\n`;

        console.log(box('Métricas de Contexto y Ventana 1M', content, C.granate));
        rl.prompt();
        return;
      }

      if (cmd === '/compact' || cmd === '/compress') {
        if (messages.length < 4) {
          console.log(`\n  ${C.gray}La conversación aún es breve (${messages.length} mensajes). No es necesario compactar todavía.${C.reset}\n`);
          rl.prompt();
          return;
        }
        console.log(`\n  ${C.granateBright}●${C.reset} ${C.white}Compactando memoria de conversación (estilo Claude Code)...${C.reset}`);
        const comp = compactContext(messages, { force: true });
        if (comp.compacted) {
          if (activeSession) {
            activeSession.messages = messages;
            activeSession.contextTokens = comp.afterTokens;
            saveSession(activeSession);
          }
          console.log(renderCompactionCard(comp.beforeTokens, comp.afterTokens, comp.freedPct));
          console.log(`  ${C.green}✓ Memoria compactada con éxito.${C.reset} Espacio libre para seguir programando.\n`);
        } else {
          console.log(`  ${C.gold}ℹ No fue necesario compactar.${C.reset}\n`);
        }
        rl.setPrompt(getPrompt());
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

      if (cmd === '/paste' || cmd === '/clipboard' || cmd === '/img') {
        console.log(`\n  ${C.cyan}Leyendo captura del portapapeles del sistema...${C.reset}`);
        const clip = getClipboardImage();
        if (!clip.success) {
          console.log(`  ${C.gold}⚠ ${clip.error || 'No se encontró imagen en el portapapeles.'}${C.reset}`);
          console.log(`  ${C.gray}Tip: haz una captura con Win+Shift+S (Windows), Cmd+Shift+4 (Mac) o PrtScn y repite /paste.${C.reset}\n`);
          rl.prompt();
          return;
        }
        console.log(`  ${C.green}✓ Imagen capturada:${C.reset} ${clip.imagePath}`);
        const promptAfter = parts.slice(1).join(' ') || 'Analiza esta captura de pantalla y relaciónala con el código del proyecto.';
        await runTurn(promptAfter, [{ path: clip.imagePath, data_url: clip.dataUrl, size_bytes: fs.existsSync(clip.imagePath) ? fs.statSync(clip.imagePath).size : 0 }]);
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/agent' || cmd === '/subagent') {
        const role = parts[1];
        const task = parts.slice(2).join(' ');
        if (!role || !task) {
          console.log(`\n  ${C.rose}Uso:${C.reset} ${C.bold}/agent <rol> <tarea>${C.reset}`);
          console.log(`  ${C.gray}Ejemplo: /agent Auditor "Analiza src/agent.js en busca de fugas"${C.reset}\n`);
          rl.prompt();
          return;
        }
        busy = true;
        try {
          const result = await Tools.invoke_subagent({ role, task }, { cfg: { ...cfg, apiKey: cfg.isCustomEndpoint ? cfg.endpointKey : cfg.apiKey }, streamCompletion });
          if (result.report) {
            console.log(`\n${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}`);
            console.log(result.report);
            console.log(`${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}\n`);
          } else if (result.error) {
            console.log(Status.error(result.error));
          }
        } catch (err) {
          console.log(Status.error(err.message));
        } finally {
          busy = false;
        }
        rl.prompt();
        return;
      }

      if (cmd === '/config') {
        const key = parts[1]?.toLowerCase();
        const val = parts[2];
        if (key === 'endpoint' && val) {
          if (IS_CLOSED) closedOnlyNotice(); else applyEndpoint(val);
        } else if (key === 'mode' && MODES.includes((val || '').toLowerCase())) {
          setMode(val, { persist: true });
        } else {
          console.log(`\n${C.granateDark}┌─ ${C.bold}${C.granateBright}Configuración Local Deiza Code${C.reset} ${C.granateDark}${'─'.repeat(25)}┐${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Ruta de configuración:${C.reset}  ${C.gray}~/.deiza/config.json${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Cuenta Deiza:${C.reset}           ${C.gray}${cfg.email || 'No iniciada'} [${String(cfg.plan || '').toUpperCase()}]${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Motor / endpoint:${C.reset}       ${C.gray}${cfg.isCustomEndpoint ? cfg.apiBase : 'Deiza (nativo)'}${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Modelo:${C.reset}                 ${C.gray}${cfg.model}${C.reset}`);
          console.log(`  ${C.granateDark}│${C.reset}  ${C.white}Modo actual:${C.reset}            ${modeBadge(currentMode)} ${C.gray}(por defecto: ${cfg.defaultMode || 'build'})${C.reset}`);
          console.log(`${C.granateDark}└────────────────────────────────────────────────────────────┘${C.reset}`);
          console.log(`  ${C.gray}Ajusta valores con: ${IS_CLOSED ? '' : '/config endpoint <url|deiza> · '}/config mode <build|copilot|plan>${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/update') {
        console.log(`\n  ${C.gray}Comprobando actualizaciones de Deiza Code...${C.reset}`);
        const remoteVer = await checkLatestVersion();
        if (!remoteVer) {
          console.log(`  ${C.gold}No se pudo contactar con el servidor de versiones. Se descargará el instalador oficial.${C.reset}`);
        } else if (!isNewerVersion(remoteVer.version, VERSION)) {
          console.log(`  ${C.green}✓ Ya estás en la versión más reciente de Deiza Code (v${VERSION}).${C.reset}\n`);
          rl.prompt();
          return;
        } else {
          console.log(`  ${C.cyan}● Nueva versión detectada:${C.reset} ${C.white}v${VERSION}${C.reset} ➜ ${C.bold}${C.green}v${remoteVer.version}${C.reset}`);
          if (remoteVer.notes) console.log(`  ${C.gray}Novedades: ${remoteVer.notes}${C.reset}`);
        }
        busy = true;
        const approved = await confirmAction('¿Descargar e instalar la actualización ahora? [S/n]: ');
        if (!approved) {
          busy = false;
          console.log(`  ${C.gray}Actualización cancelada.${C.reset}\n`);
          rl.prompt();
          return;
        }
        console.log(`\n  ${C.granateBright}●${C.reset} ${C.white}Actualizando Deiza Code...${C.reset}`);
        try {
          await runAutoUpdate();
          console.log(`  ${C.green}✓ Deiza Code actualizado con éxito.${C.reset}`);
          console.log(`  ${C.cyan}↻ Reiniciando Deiza Code en la nueva versión...${C.reset}\n`);
          restartSelf();
          return;
        } catch (err) {
          console.log(Status.error(`Error durante la actualización: ${err.message}`));
        } finally {
          busy = false;
        }
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
        const promptAfterImage = parts.slice(2).join(' ') || 'Analiza esta imagen y describe las acciones necesarias en el código.';
        console.log(`  ${C.cyan}Imagen cargada:${C.reset} ${imagePath} (${Math.round(imgResult.size_bytes / 1024)} KB)`);
        await runTurn(promptAfterImage, [imgResult]);
        rl.setPrompt(getPrompt());
        rl.prompt();
        return;
      }

      if (cmd === '/model' || cmd === '/models') {
        const targetModel = parts[1]?.trim();
        if (!cfg.isCustomEndpoint) {
          if (targetModel && targetModel.toLowerCase() !== DEFAULT_MODEL) {
            console.log(`\n  ${C.granateBright}✖ Modelo no válido:${C.reset} "${targetModel}"`);
            console.log(`  Deiza Code funciona con el motor ${C.bold}deiza-omniscient${C.reset}.`);
            if (!IS_CLOSED) console.log(`  ${C.gray}Para usar modelos locales o de terceros (Ollama, vLLM, OpenAI): /endpoint <url>${C.reset}`);
            console.log('');
          } else {
            cfg.model = DEFAULT_MODEL;
            saveConfig(cfg);
            console.log(`\n${C.granateBold}Motor de Deiza Code:${C.reset}`);
            console.log(`  ${C.green}●${C.reset} ${C.bold}deiza-omniscient${C.reset} (Deiza Liquid 5.1)`);
            console.log(`    ${C.gray}Infraestructura:${C.reset}  Clusters dedicados de Deiza`);
            console.log(`    ${C.gray}Especialidad:${C.reset}    Diffs quirúrgicos, multiagentes, visión y ejecución autónoma`);
            console.log(`    ${C.gray}Uso:${C.reset}             Se descuenta de la cuota de tu plan (${String(cfg.plan || '').toUpperCase()}) · /usage\n`);
          }
        } else if (targetModel) {
          cfg.model = targetModel;
          cfg.endpointModel = targetModel;
          saveConfig(cfg);
          console.log(`  ${C.green}✓ Modelo del endpoint cambiado a ${C.bold}${targetModel}${C.reset}\n`);
        } else {
          console.log(`\n  ${C.white}Modelo actual:${C.reset} ${cfg.model} ${C.gray}(endpoint ${cfg.apiBase})${C.reset}`);
          console.log(`  ${C.gray}Usa /model <id> para cambiarlo, o /endpoint deiza para volver al motor nativo.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/endpoint') {
        if (IS_CLOSED) {
          closedOnlyNotice();
          rl.prompt();
          return;
        }
        const target = parts[1];
        if (target) {
          applyEndpoint(target, parts[2]);
        } else {
          console.log(`\n${C.granateBold}Motor de inferencia:${C.reset}`);
          console.log(`  Actual:          ${C.white}${cfg.isCustomEndpoint ? cfg.apiBase : 'Deiza (nativo, deiza-omniscient)'}${C.reset}`);
          console.log(`  Ollama local:    /endpoint http://127.0.0.1:11434 llama3`);
          console.log(`  vLLM / LMStudio: /endpoint http://127.0.0.1:8000/v1 <modelo>`);
          console.log(`  Volver a Deiza:  /endpoint deiza\n`);
          console.log(`  ${C.gray}Tu cuenta de Deiza sigue siendo necesaria; solo cambia el motor que responde.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/usage') {
        const currentUsage = await fetchUsage(cfg.apiKey, cfg.accountBase);
        if (!currentUsage) {
          console.log(`  ${C.gray}No se pudo obtener la información de uso (¿sin conexión?).${C.reset}\n`);
        } else {
          const usedPct = currentUsage.token_limit > 0 ? Math.round((currentUsage.tokens_used / currentUsage.token_limit) * 100) : 0;
          const mins = currentUsage.reset_in_seconds ? Math.ceil(currentUsage.reset_in_seconds / 60) : 0;
          console.log(`\n${C.granateBold}Estado de uso de tu plan:${C.reset}`);
          console.log(`  Plan:              ${C.bold}${String(currentUsage.plan).toUpperCase()}${C.reset}`);
          console.log(`  Tokens utilizados: ${(currentUsage.tokens_used || 0).toLocaleString()} / ${(currentUsage.token_limit || 0).toLocaleString()} (${usedPct}%)`);
          console.log(`  Ventana de uso:    ${mins > 0 ? `Se reinicia en ${Math.floor(mins / 60)}h ${mins % 60}m` : 'Sin consumo en la ventana actual'}\n`);
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
          console.log(`  ${C.gold}El archivo .deizarules ya existe en este proyecto.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/clear') {
        messages.length = 0;
        if (activeSession) { activeSession.messages = []; saveSession(activeSession); }
        console.clear();
        console.log(`  ${C.green}✓ Contexto de conversación limpiado.${C.reset}\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/login') {
        await doLogin(true);
        rl.prompt();
        return;
      }

      if (cmd === '/logout') {
        cfg = { ...cfg, apiKey: '', email: '', name: '', plan: '', usage: null };
        saveConfig(cfg);
        console.log(`  ${C.green}✓ Sesión cerrada. Credenciales eliminadas de ~/.deiza/config.json${C.reset}`);
        console.log(`  ${C.gray}Deiza Code necesita una cuenta para funcionar: inicia sesión de nuevo o cierra con /exit.${C.reset}`);
        await doLogin(true);
        rl.prompt();
        return;
      }

      if (cmd === '/exit' || cmd === '/quit') {
        rl.close();
        return;
      }

      console.log(`  ${C.granateBright}Comando desconocido:${C.reset} ${cmd}. Escribe / para ver la lista de comandos.\n`);
      rl.prompt();
      return;
    }

    // Image path or tag pasted or dragged into the terminal
    const imgDetection = detectImageInText(input);
    const runImages = [];
    let effectiveInput = input;
    if (imgDetection.hasImage) {
      console.log(`  ${C.cyan}› [image]:${C.reset} ${imgDetection.imagePath}${imgDetection.fromClipboard ? ` ${C.gray}(portapapeles)${C.reset}` : ''}`);
      runImages.push({
        path: imgDetection.imagePath,
        data_url: imgDetection.dataUrl,
        size_bytes: fs.existsSync(imgDetection.imagePath) ? fs.statSync(imgDetection.imagePath).size : 0,
      });
      effectiveInput = imgDetection.promptText;
    }

    await runTurn(effectiveInput, runImages);
    rl.setPrompt(getPrompt());
    rl.prompt();
  });

  function closedOnlyNotice() {
    console.log(`\n  ${C.gold}Esta edición de Deiza Code funciona en exclusiva con ${C.bold}Deiza Omniscient${C.reset}${C.gold} y tu cuenta de Deiza.${C.reset}`);
    console.log(`  ${C.gray}La edición open source con soporte de otros motores está en github.com/marcosdeaza/deiza-code${C.reset}\n`);
  }

  function applyEndpoint(target, modelArg) {
    const t = String(target || '').trim().toLowerCase();
    if (t === 'deiza' || t === 'reset' || t === 'native' || t === 'nativo' || isDeizaHost(target)) {
      cfg.endpoint = '';
      cfg.apiBase = cfg.accountBase;
      cfg.isCustomEndpoint = false;
      cfg.model = DEFAULT_MODEL;
      saveConfig(cfg);
      console.log(`  ${C.green}✓ Motor nativo de Deiza restaurado (deiza-omniscient).${C.reset}\n`);
      return;
    }
    let url = normalizeUrl(target);
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    try { new URL(url); } catch { console.log(Status.error(`URL no válida: ${target}`)); return; }
    cfg.endpoint = url;
    cfg.apiBase = url;
    cfg.isCustomEndpoint = true;
    if (modelArg) cfg.endpointModel = modelArg;
    cfg.model = cfg.endpointModel || 'default';
    saveConfig(cfg);
    console.log(`  ${C.green}✓ Endpoint actualizado a:${C.reset} ${cfg.apiBase} ${C.gray}(modelo: ${cfg.model})${C.reset}`);
    console.log(`  ${C.gray}Si el servidor requiere clave: DEIZA_ENDPOINT_KEY o deiza --endpoint <url> --key <clave>.${C.reset}\n`);
  }

  rl.on('SIGINT', () => {
    if (busy && abortCtl) { abortCtl.abort(); return; }
    rl.close();
  });

  rl.on('close', () => {
    console.log(`\n${C.gray}Sesión finalizada.${C.reset}\n`);
    process.exit(0);
  });
}

module.exports = {
  startRepl,
  checkLatestVersion,
  isNewerVersion,
};

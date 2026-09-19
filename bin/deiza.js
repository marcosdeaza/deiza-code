#!/usr/bin/env node

/**
 * DEIZA CODE — CLI Executable Entry Point
 */

const readline = require('readline');
const { C, Status, renderSessionList, renderSessionInfo, box } = require('../src/ui');
const { loadConfig, saveConfig, VERSION, DEFAULT_MODEL, MODES, IS_CLOSED, normalizeUrl, isDeizaHost } = require('../src/config');
const { ensureAuthenticated, askLine } = require('../src/auth');
const { startRepl } = require('../src/index');
const { runAgentTurn } = require('../src/agent');
const { listSessions, createSession, loadSession, deleteSession, getLatestSession } = require('../src/session');

function printHelp() {
  console.log(`
${C.granateBold}DEIZA CODE — Autonomous Terminal Coding Agent v${VERSION}${C.reset}
Uso:
  deiza [opciones] [instrucción]
  deiza-code [opciones] [instrucción]

Modos de permisos:
  --build               Autónomo (por defecto): edita, ejecuta y verifica sin pedir permiso
  --copilot             Supervisado: cada cambio y comando se muestra y se aprueba
  --plan                Solo lectura: analiza y propone un plan sin tocar archivos

Opciones:
  -v, --version         Muestra la versión instalada
  -h, --help            Muestra este mensaje de ayuda
  -p, --prompt <texto>  Ejecuta una instrucción directa en modo no interactivo
  --login               Vuelve a iniciar sesión con tu cuenta de Deiza
  --logout              Cierra la sesión guardada en esta máquina${IS_CLOSED ? '' : `
  --endpoint <url>      Motor OpenAI-compatible alternativo (Ollama, vLLM, OpenAI...)
  --model <id>          Modelo del endpoint alternativo
  --key <apiKey>        Clave del endpoint alternativo (si la requiere)`}

Subcomandos:
  deiza session list|new|delete|info
  deiza tokens

Deiza Code siempre necesita una cuenta de Deiza con plan de pago (Friend o Signet).${IS_CLOSED ? `
Motor: Deiza Omniscient (Deiza Liquid 5.1), con la cuota de uso de tu plan.` : ''}
Ejemplos:
  deiza
  deiza --copilot
  deiza -p "añade tests a src/utils.js"${IS_CLOSED ? '' : `
  deiza --endpoint http://localhost:11434 --model llama3`}
`);
}

function printTokens(ses) {
  const curTokens = ses?.tokens || { prompt: 0, completion: 0, total: 0 };
  const maxTokens = 1000000;
  const total = curTokens.total || 0;
  const pct = ((total / maxTokens) * 100).toFixed(2);
  const remaining = Math.max(0, maxTokens - total);
  let content = '';
  content += `${C.white}Motor de Inferencia:${C.reset}     ${C.granateBright}deiza-omniscient${C.reset} ${C.gray}(Deiza Liquid 5.1 · infraestructura dedicada)${C.reset}\n`;
  content += `${C.white}Ventana de Contexto:${C.reset}     ${C.bold}1,000,000 (1M)${C.reset} tokens de sesión\n`;
  content += `${C.white}Tokens en Contexto:${C.reset}      ${C.bold}${C.green}${total.toLocaleString()}${C.reset} / 1,000,000 tokens (${pct}% ocupado)\n`;
  content += `${C.white}Capacidad Disponible:${C.reset}    ${C.bold}${remaining.toLocaleString()}${C.reset} tokens libres\n\n`;
  content += `${C.granateBright}── Desglose de la Sesión (${ses?.id || 'sin sesión activa'}) ──${C.reset}\n`;
  content += `${C.white}• Prompt (Entrada):${C.reset}         ${C.gold}${(curTokens.prompt || 0).toLocaleString()}${C.reset} tokens\n`;
  content += `${C.white}• Completion (Salida):${C.reset}     ${C.gold}${(curTokens.completion || 0).toLocaleString()}${C.reset} tokens\n`;
  console.log(box('Métricas de Contexto y Tokens (Ventana 1M)', content, C.granate));
}

function handleSessionCommand(args) {
  const sub = (args[1] || 'list').toLowerCase();
  if (sub === 'list' || sub === 'ls') {
    console.log(renderSessionList(listSessions(process.cwd())));
    return 0;
  }
  if (sub === 'new' || sub === 'create') {
    const title = args.slice(2).join(' ') || null;
    const ses = createSession(process.cwd(), 'build', title);
    console.log(`\n  ${C.green}✓ Nueva sesión creada:${C.reset} ${C.bold}${ses.id}${C.reset}${title ? ` ("${title}")` : ''}\n`);
    return 0;
  }
  if (sub === 'delete' || sub === 'rm' || sub === 'drop') {
    const targetId = args[2];
    if (!targetId) {
      console.log(`\n  ${C.rose}Uso:${C.reset} deiza session delete <id_sesion>\n`);
      return 1;
    }
    const res = deleteSession(targetId, process.cwd());
    if (res.success) console.log(`\n  ${C.green}✓ Sesión eliminada:${C.reset} ${res.id}\n`);
    else console.log(`\n  ${C.granateBright}✖ No se encontró la sesión:${C.reset} ${targetId}\n`);
    return 0;
  }
  if (sub === 'info' || sub === 'stats') {
    const targetId = args[2];
    const ses = targetId ? loadSession(targetId, process.cwd()) : getLatestSession(process.cwd());
    if (ses) console.log(renderSessionInfo(ses));
    else console.log(`\n  ${C.gray}No hay sesiones en este workspace.${C.reset}\n`);
    return 0;
  }
  console.log(`
${C.granateBold}DEIZA CODE — Gestor de Sesiones CLI${C.reset}
Uso:
  deiza session list           Lista todas las sesiones del proyecto y tokens
  deiza session new [nombre]   Crea una sesión nueva en limpio
  deiza session delete <id>    Elimina una sesión
  deiza session info [id]      Muestra desglose de tokens y detalles
`);
  return 0;
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'tokens' || args[0] === 'context') {
    printTokens(getLatestSession(process.cwd()));
    process.exit(0);
  }
  if (args[0] === 'session' || args[0] === 'sessions') {
    process.exit(handleSessionCommand(args));
  }
  if (args.includes('--version') || args.includes('-v')) {
    console.log(`deiza-code v${VERSION}`);
    process.exit(0);
  }
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  let cfg = loadConfig();

  if (args.includes('--logout')) {
    cfg = { ...cfg, apiKey: '', email: '', name: '', plan: '' };
    saveConfig(cfg);
    console.log(`  ${C.green}✓ Sesión cerrada. Credenciales eliminadas de ~/.deiza/config.json${C.reset}`);
    process.exit(0);
  }

  // CLI flags
  const consumed = new Set();
  let inlinePrompt = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--endpoint' || a === '--model' || a === '--key') && IS_CLOSED) {
      console.log(`  ${C.gold}Opción ${a} ignorada: esta edición de Deiza Code funciona en exclusiva con Deiza Omniscient.${C.reset}`);
      consumed.add(i); if (args[i + 1] && !args[i + 1].startsWith('-')) { consumed.add(i + 1); i++; }
    } else if (a === '--endpoint' && args[i + 1]) {
      const url = normalizeUrl(args[i + 1]);
      if (url && !isDeizaHost(url)) {
        cfg.endpoint = url;
        cfg.apiBase = url;
        cfg.isCustomEndpoint = true;
        cfg.model = cfg.endpointModel || 'default';
      } else {
        cfg.endpoint = '';
        cfg.apiBase = cfg.accountBase;
        cfg.isCustomEndpoint = false;
        cfg.model = DEFAULT_MODEL;
      }
      consumed.add(i); consumed.add(i + 1); i++;
    } else if (a === '--model' && args[i + 1]) {
      cfg.model = args[i + 1];
      if (cfg.isCustomEndpoint) cfg.endpointModel = args[i + 1];
      consumed.add(i); consumed.add(i + 1); i++;
    } else if (a === '--key' && args[i + 1]) {
      cfg.endpointKey = args[i + 1];
      consumed.add(i); consumed.add(i + 1); i++;
    } else if (a === '-p' || a === '--prompt') {
      inlinePrompt = args[i + 1] || null;
      consumed.add(i); consumed.add(i + 1); i++;
    } else if (a === '--plan' || a === '--copilot' || a === '--build') {
      cfg.mode = a.slice(2);
      consumed.add(i);
    } else if (a === '--login' || a === '-y' || a === '--yes') {
      consumed.add(i);
    }
  }
  if (!cfg.mode) cfg.mode = cfg.defaultMode || 'build';
  if (cfg.isCustomEndpoint) saveConfig(cfg);

  // Bare text after the flags is a direct prompt
  if (!inlinePrompt) {
    const rest = args.filter((a, i) => !consumed.has(i) && !a.startsWith('-'));
    if (rest.length > 0) inlinePrompt = rest.join(' ');
  }

  // A valid, paid Deiza account is required before anything else. The temporary
  // readline is closed before the REPL opens its own on the same stdin.
  const tmpRl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  tmpRl.__deizaQueue = [];
  tmpRl.on('line', (l) => tmpRl.__deizaQueue.push(l));
  try {
    cfg = await ensureAuthenticated(cfg, { rl: tmpRl, force: args.includes('--login') });
  } catch (err) {
    tmpRl.close();
    if (err?.message !== 'PLAN_REQUIRED') console.error(Status.error(err.message));
    process.exit(err?.exitCode || 1);
  }
  tmpRl.close();

  if (inlinePrompt) {
    const messages = [];
    const autoYes = args.includes('-y') || args.includes('--yes');
    // COPILOT approvals in one-shot mode: -y approves everything, a TTY asks, a pipe rejects.
    const confirmCallback = async (text) => {
      if (autoYes) return true;
      if (!process.stdin.isTTY) return false;
      const a = String(await askLine(`  ${C.gold}⚠ ${text}${C.reset}`) || '').trim().toLowerCase();
      return a === '' || a === 's' || a === 'si' || a === 'sí' || a === 'y' || a === 'yes';
    };
    try {
      await runAgentTurn({
        cfg,
        messages,
        userInput: inlinePrompt,
        confirmCallback,
        mode: cfg.mode,
      });
      process.exit(0);
    } catch (err) {
      console.error(Status.error(err.message));
      process.exit(1);
    }
  }

  await startRepl(cfg);
}

main().catch((err) => {
  console.error(`\x1b[38;2;184;74;85m✖ Error fatal:\x1b[0m ${err.message}`);
  process.exit(1);
});

/**
 * DEIZA CODE — UI & Terminal Aesthetics
 * Granate / Burgundy palette (#8C2F39) with clean, modern developer UX.
 */

const { VERSION } = require('./config');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Granate / Crimson
  granate: '\x1b[38;2;140;47;57m',
  granateBold: '\x1b[1m\x1b[38;2;140;47;57m',
  granateBright: '\x1b[38;2;184;74;85m',
  granateDark: '\x1b[38;2;94;31;38m',
  granateBg: '\x1b[48;2;140;47;57m\x1b[37m',

  // Accents
  rose: '\x1b[38;2;225;112;128m',
  gold: '\x1b[38;2;230;180;80m',
  green: '\x1b[38;2;60;180;110m',
  greenBright: '\x1b[38;2;80;220;130m',
  blue: '\x1b[38;2;90;150;220m',
  cyan: '\x1b[38;2;100;200;220m',
  red: '\x1b[38;2;230;70;70m',
  gray: '\x1b[38;2;130;130;140m',
  darkGray: '\x1b[38;2;75;75;85m',
  white: '\x1b[38;2;245;245;250m',
};

const BANNER = `
${C.granateBold}  ██████╗  ███████╗ ██╗ ███████╗  █████╗       ██████╗  ██████╗  ██████╗  ███████╗
  ██╔══██╗ ██╔════╝ ██║ ╚══███╔╝ ██╔══██╗     ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝
  ██║  ██║ ██████╗  ██║   ███╔╝  ███████║     ██║      ██║   ██║ ██║  ██║ ██████╗ 
  ██║  ██║ ██╔═══╝  ██║  ███╔╝   ██╔══██║     ██║      ██║   ██║ ██║  ██║ ██╔═══╝ 
  ██████╔╝ ███████╗ ██║ ███████╗ ██║  ██║     ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗
  ╚═════╝  ╚══════╝ ╚═╝ ╚══════╝ ╚═╝  ╚═╝      ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝${C.reset}
  ${C.gray}Autonomous Terminal Coding Agent · v${VERSION}${C.reset}
`;

const MODE_INFO = {
  build: { label: 'BUILD', color: C.rose, desc: 'Autónomo: edita, ejecuta y verifica sin pedir permiso.' },
  copilot: { label: 'COPILOT', color: C.gold, desc: 'Supervisado: cada cambio y comando se muestra y se aprueba.' },
  plan: { label: 'PLAN', color: C.cyan, desc: 'Solo lectura: analiza y propone un plan sin tocar archivos.' },
};

function modeBadge(mode) {
  const info = MODE_INFO[mode] || MODE_INFO.build;
  return `${info.color}[${info.label}]${C.reset}`;
}

function renderModes(current) {
  let out = `\n${C.granateBold}Modos de permisos de Deiza Code:${C.reset}\n`;
  for (const key of ['build', 'copilot', 'plan']) {
    const info = MODE_INFO[key];
    const mark = key === current ? `${C.green}●${C.reset}` : `${C.darkGray}○${C.reset}`;
    out += `  ${mark} ${info.color}${info.label.padEnd(8)}${C.reset} ${C.white}/${key}${C.reset}${' '.repeat(Math.max(1, 10 - key.length))}${C.gray}${info.desc}${C.reset}\n`;
  }
  out += `  ${C.gray}Cambia con /build, /copilot o /plan. Por defecto: BUILD (guárdalo con /config mode <modo>).${C.reset}\n`;
  return out;
}

const Status = {
  thinking: `  ${C.granateBright}●${C.reset} ${C.gray}Analizando y procesando...${C.reset}`,
  executing: (cmd) => `  ${C.gold}⚡ [bash]${C.reset} ${C.white}${cmd}${C.reset}`,
  editing: (file) => `  ${C.blue}✎ [edit]${C.reset} ${C.white}${file}${C.reset}`,
  writing: (file) => `  ${C.green}+ [write]${C.reset} ${C.white}${file}${C.reset}`,
  reading: (file) => `  ${C.cyan}📖 [read]${C.reset} ${C.white}${file}${C.reset}`,
  listing: (dir) => `  ${C.gray}📁 [list]${C.reset} ${C.white}${dir}${C.reset}`,
  searching: (query) => `  ${C.gray}🔍 [search]${C.reset} ${C.white}${query}${C.reset}`,
  subagent: (role, task) => `  ${C.rose}🤖 [agent:${role}]${C.reset} ${C.white}${task}${C.reset}`,
  vision: (file) => `  ${C.cyan}👁 [vision]${C.reset} ${C.white}${file}${C.reset}`,
  success: `  ${C.green}✓${C.reset} ${C.white}Completado con éxito${C.reset}`,
  error: (msg) => `  ${C.granateBright}✖ Error:${C.reset} ${msg}`,
};

/**
 * Format a visual unified diff for terminal display
 */
function renderDiff(filePath, oldContent, newContent) {
  const oldLines = oldContent ? oldContent.split('\n') : [];
  const newLines = newContent ? newContent.split('\n') : [];

  let out = `\n  ${C.bold}Diff:${C.reset} ${C.white}${filePath}${C.reset}\n`;
  out += `  ${C.darkGray}──────────────────────────────────────────────────${C.reset}\n`;

  // Find range of differences
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const contextBefore = Math.max(0, start - 2);
  const contextAfterOld = Math.min(oldLines.length, oldEnd + 3);
  const contextAfterNew = Math.min(newLines.length, newEnd + 3);

  // Context before
  for (let i = contextBefore; i < start; i++) {
    out += `  ${C.darkGray}${String(i + 1).padStart(4)} │${C.reset}   ${oldLines[i]}\n`;
  }

  // Deletions
  for (let i = start; i <= oldEnd; i++) {
    out += `  ${C.red}${String(i + 1).padStart(4)} - │ - ${oldLines[i]}${C.reset}\n`;
  }

  // Additions
  for (let i = start; i <= newEnd; i++) {
    out += `  ${C.green}${String(i + 1).padStart(4)} + │ + ${newLines[i]}${C.reset}\n`;
  }

  // Context after
  for (let i = oldEnd + 1; i < contextAfterOld; i++) {
    out += `  ${C.darkGray}${String(i + 1).padStart(4)} │${C.reset}   ${oldLines[i]}\n`;
  }

  out += `  ${C.darkGray}──────────────────────────────────────────────────${C.reset}\n`;
  return out;
}

/**
 * Boxen-like bordered message
 */
function box(title, content, color = C.granate) {
  const lines = content.split('\n');
  const maxLen = Math.max(title.length + 4, ...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').length));
  const border = '─'.repeat(maxLen + 2);

  let out = `\n  ${color}┌─ ${C.bold}${title}${C.reset}${color} ${'─'.repeat(Math.max(0, maxLen - title.length - 1))}┐${C.reset}\n`;
  for (const line of lines) {
    const rawLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = ' '.repeat(Math.max(0, maxLen - rawLen));
    out += `  ${color}│${C.reset} ${line}${padding} ${color}│${C.reset}\n`;
  }
  out += `  ${color}└${border}┘${C.reset}\n`;
  return out;
}

/**
 * Simple syntax highlighting for streamed code blocks in terminal
 */
function highlightMarkdown(text) {
  return text
    .replace(/`([^`]+)`/g, `${C.gold}$1${C.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${C.bold}$1${C.reset}`);
}

const COMMANDS_REGISTRY = [
  { cmd: '/build', args: '', desc: 'Modo BUILD (por defecto): autónomo, sin pedir permisos', cat: 'Modos' },
  { cmd: '/copilot', args: '', desc: 'Modo COPILOT: revisa y aprueba cada cambio y comando', cat: 'Modos' },
  { cmd: '/plan', args: '', desc: 'Modo PLAN: análisis y plan de implementación sin tocar archivos', cat: 'Modos' },
  { cmd: '/mode', args: '[build|copilot|plan]', desc: 'Ver o cambiar el modo de permisos activo', cat: 'Modos' },
  { cmd: '/session', args: '[list|new|resume|delete|info]', desc: 'Gestor de sesiones: listar, crear, reanudar, borrar y métricas', cat: 'Sesión' },
  { cmd: '/tokens', args: '', desc: 'Métricas de la ventana de contexto y tokens de la sesión', cat: 'Sesión' },
  { cmd: '/context', args: '', desc: 'Alias de /tokens', cat: 'Sesión' },
  { cmd: '/history', args: '', desc: 'Ver historial de conversaciones y consumo de tokens', cat: 'Conversaciones' },
  { cmd: '/resume', args: '[id]', desc: 'Continuar una conversación anterior con todo su contexto', cat: 'Conversaciones' },
  { cmd: '/new', args: '[título]', desc: 'Iniciar una nueva conversación limpia en este workspace', cat: 'Conversaciones' },
  { cmd: '/paste', args: '', desc: 'Pegar captura del portapapeles (Win+Shift+S / PrtScn / Cmd+Shift+4)', cat: 'Herramientas' },
  { cmd: '/image', args: '<ruta> [inst]', desc: 'Analizar capturas o maquetas con visión multimodal', cat: 'Herramientas' },
  { cmd: '/agent', args: '<rol> <tarea>', desc: 'Lanzar un subagente worker aislado (ej: Auditor, Tester)', cat: 'Agentes' },
  { cmd: '/whoami', args: '', desc: 'Ver tu cuenta, plan, tokens y cuota activa', cat: 'Cuenta' },
  { cmd: '/usage', args: '', desc: 'Consultar consumo de tokens y ventana de 5 horas', cat: 'Cuenta' },
  { cmd: '/login', args: '', desc: 'Iniciar sesión con tu cuenta de Deiza (navegador o API Key)', cat: 'Cuenta' },
  { cmd: '/logout', args: '', desc: 'Cerrar sesión en esta máquina', cat: 'Cuenta' },
  { cmd: '/update', args: '', desc: 'Comprobar y actualizar Deiza Code a la última versión', cat: 'Sistema' },
  { cmd: '/model', args: '[id]', desc: 'Motor activo (deiza-omniscient) o modelo del endpoint custom', cat: 'Configuración' },
  { cmd: '/endpoint', args: '[url|deiza]', desc: 'Usar otro motor OpenAI-compatible (Ollama, vLLM...) o volver a Deiza', cat: 'Configuración' },
  { cmd: '/config', args: '', desc: 'Ver o modificar la configuración local', cat: 'Configuración' },
  { cmd: '/init', args: '', desc: 'Crear directivas .deizarules en la raíz del repo', cat: 'Proyecto' },
  { cmd: '/clear', args: '', desc: 'Limpiar el contexto de la conversación actual', cat: 'Sesión' },
  { cmd: '/help', args: '', desc: 'Ver todos los comandos', cat: 'Ayuda' },
  { cmd: '/exit', args: '', desc: 'Salir de Deiza Code', cat: 'Sesión' },
];

/**
 * Renders an interactive command palette preview
 */
function renderCommandPalette(filter = '') {
  const query = filter.trim().toLowerCase();
  const matches = COMMANDS_REGISTRY.filter(c => {
    if (!query || query === '/') return true;
    const cleanQ = query.startsWith('/') ? query : `/${query}`;
    return c.cmd.toLowerCase().startsWith(cleanQ) || c.desc.toLowerCase().includes(query.replace(/^\//, ''));
  });

  if (matches.length === 0) return '';

  let out = `\n  ${C.granateDark}┌─ ${C.bold}${C.granateBright}Comandos Disponibles${C.reset} ${C.gray}(escribe para filtrar o presiona [Tab] para autocompletar)${C.reset} ${C.granateDark}${'─'.repeat(12)}┐${C.reset}\n`;
  for (const item of matches.slice(0, 10)) {
    const cmdStr = `${C.bold}${C.rose}${item.cmd}${C.reset}${item.args ? ` ${C.gray}${item.args}${C.reset}` : ''}`;
    const rawCmdLen = item.cmd.length + (item.args ? item.args.length + 1 : 0);
    const padLen = Math.max(2, 28 - rawCmdLen);
    const padding = ' '.repeat(padLen);
    out += `  ${C.granateDark}│${C.reset}   ${cmdStr}${padding}${C.white}${item.desc}${C.reset}\n`;
  }
  if (matches.length > 10) {
    out += `  ${C.granateDark}│${C.reset}   ${C.gray}... y ${matches.length - 10} comandos más (escribe más letras para filtrar)${C.reset}\n`;
  }
  out += `  ${C.granateDark}└────────────────────────────────────────────────────────────────────────────────────────┘${C.reset}\n`;
  return out;
}

/**
 * Format /whoami account profile view
 */
function renderWhoami({ email, name, plan, apiKey, apiBase, isCustom, usage, currentMode }) {
  const usedPct = usage && usage.token_limit > 0 ? Math.round((usage.tokens_used / usage.token_limit) * 100) : 0;
  const mins = usage?.reset_in_seconds ? Math.ceil(usage.reset_in_seconds / 60) : 0;
  const resetText = mins > 0 ? `Se reinicia en ${Math.floor(mins / 60)}h ${mins % 60}m` : '0% (se iniciará al enviar un mensaje)';
  const keySnippet = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'No configurada';

  let content = '';
  content += `${C.white}Cuenta / Usuario:${C.reset}   ${C.bold}${name ? `${name} · ` : ''}${email || 'Conectada'}${C.reset}\n`;
  content += `${C.white}Plan de Suscripción:${C.reset} ${C.granateBold}[${(plan || 'pro').toUpperCase()}]${C.reset} (Acceso completo Deiza Code)\n`;
  content += `${C.white}Motor:${C.reset}              ${isCustom ? `${C.gold}Endpoint personalizado ${apiBase}${C.reset}` : `${C.green}Nativo Deiza.org${C.reset}`}\n`;
  content += `${C.white}API Key Guardada:${C.reset}   ${C.gray}${keySnippet}${C.reset}\n`;
  content += `${C.white}Modo de permisos:${C.reset}   ${modeBadge(currentMode)} ${C.gray}${(MODE_INFO[currentMode] || MODE_INFO.build).desc}${C.reset}\n`;
  if (usage) {
    content += `${C.white}Tokens Utilizados:${C.reset}  ${usage.tokens_used.toLocaleString()} / ${usage.token_limit.toLocaleString()} (${usedPct}%)\n`;
    content += `${C.white}Ventana 5 Horas:${C.reset}    ${C.gray}${resetText}${C.reset}\n`;
  }
  content += `${C.white}Motor de Inferencia:${C.reset} ${isCustom ? `${C.granateBright}${C.reset}` : `${C.granateBright}Deiza Omniscient${C.reset} ${C.gray}[Liquid 5.1 · Amazon AWS Dedicated Cluster]${C.reset}`}`;

  return box('Perfil de Usuario — Deiza Code', content, C.granate);
}

function renderSessionList(sessions, activeSessionId) {
  if (!sessions || sessions.length === 0) {
    return `\n  ${C.gray}No hay conversaciones guardadas en este workspace. Usa ${C.white}/session new${C.gray} para iniciar una limpia.${C.reset}\n`;
  }

  let totalTokensAll = 0;
  let content = `  ${C.darkGray}Sesiones en este workspace (usa ${C.white}/session resume <id>${C.darkGray} para continuar o ${C.white}/session delete <id>${C.darkGray} para borrar):${C.reset}\n\n`;

  for (const s of sessions) {
    const isActive = s.id === activeSessionId;
    const bullet = isActive ? `${C.green}● [ACTIVA]${C.reset}` : `${C.gray}○${C.reset}`;
    const modeStr = modeBadge(s.mode || 'build');
    const dateStr = s.updatedAt ? new Date(s.updatedAt).toLocaleString('es-ES', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const title = s.title.length > 32 ? s.title.slice(0, 30) + '..' : s.title;
    const tokens = s.tokens || { total: 0 };
    totalTokensAll += (tokens.total || 0);

    const tokenStr = tokens.total > 0
      ? `${C.gold}⚡ ${tokens.total.toLocaleString()} tok${C.reset}`
      : `${C.darkGray}0 tok${C.reset}`;

    content += `  ${bullet} ${C.bold}${C.white}${s.id}${C.reset}  ${modeStr}  ${C.gray}${dateStr}${C.reset}  ${C.white}${title}${C.reset}  ${tokenStr}  ${C.darkGray}(${s.messageCount} msgs)${C.reset}\n`;
  }

  content += `\n  ${C.darkGray}───────────────────────────────────────────────────────────────────${C.reset}\n`;
  content += `  ${C.white}Total acumulado en este workspace:${C.reset} ${C.bold}${C.green}${totalTokensAll.toLocaleString()}${C.reset} ${C.white}tokens consumidos across ${sessions.length} sesiones.${C.reset}\n`;
  content += `  ${C.gray}Comandos rápidos: /session new [nombre] · /session resume <id> · /session delete <id> · /session info${C.reset}`;

  return box('Historial de Sesiones y Consumo de Tokens', content, C.granate);
}

function renderSessionInfo(session) {
  if (!session) return `\n  ${C.gray}No hay información de sesión activa.${C.reset}\n`;
  const tokens = session.tokens || { prompt: 0, completion: 0, total: 0 };
  const modeStr = `${modeBadge(session.mode || 'build')} ${C.gray}${(MODE_INFO[session.mode] || MODE_INFO.build).desc}${C.reset}`;
  const created = session.createdAt ? new Date(session.createdAt).toLocaleString('es-ES') : '-';
  const updated = session.updatedAt ? new Date(session.updatedAt).toLocaleString('es-ES') : '-';
  const msgCount = Array.isArray(session.messages) ? session.messages.length : 0;

  let content = '';
  content += `${C.white}ID de Sesión:${C.reset}         ${C.bold}${C.rose}${session.id}${C.reset}\n`;
  content += `${C.white}Título / Asunto:${C.reset}      ${C.bold}${session.title || 'Nueva conversación'}${C.reset}\n`;
  content += `${C.white}Modo de Trabajo:${C.reset}      ${modeStr}\n`;
  content += `${C.white}Ruta Workspace:${C.reset}       ${C.gray}${session.cwd || process.cwd()}${C.reset}\n`;
  content += `${C.white}Mensajes Guardados:${C.reset}   ${C.bold}${msgCount}${C.reset} mensajes\n`;
  content += `${C.white}Inicio de Conversación:${C.reset}${C.gray} ${created}${C.reset}\n`;
  content += `${C.white}Última Actualización:${C.reset}  ${C.gray}${updated}${C.reset}\n\n`;
  content += `${C.granateBright}── Métricas de Consumo de Tokens (Esta Sesión) ──${C.reset}\n`;
  content += `${C.white}Tokens de Entrada (Prompt):${C.reset}      ${C.bold}${tokens.prompt.toLocaleString()}${C.reset}\n`;
  content += `${C.white}Tokens de Salida (Completion):${C.reset}  ${C.bold}${tokens.completion.toLocaleString()}${C.reset}\n`;
  content += `${C.white}Total Tokens Sesión:${C.reset}            ${C.bold}${C.green}${tokens.total.toLocaleString()}${C.reset} tokens consumidos\n`;

  return box(`Métricas de Sesión — ${session.id}`, content, C.granate);
}

module.exports = {
  C,
  BANNER,
  MODE_INFO,
  modeBadge,
  renderModes,
  Status,
  renderDiff,
  box,
  highlightMarkdown,
  COMMANDS_REGISTRY,
  renderCommandPalette,
  renderWhoami,
  renderSessionList,
  renderSessionInfo,
};



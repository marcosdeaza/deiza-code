/**
 * DEIZA CODE — UI & Terminal Aesthetics
 * Granate / Burgundy palette (#8C2F39) with clean, modern developer UX.
 */

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
${C.granateBold}  ██████╗ ███████╗██╗███████╗ █████╗      ██████╗ ██████╗ ██████╗ ███████╗
  ██╔══██╗██╔════╝██║╚══███╔╝██╔══██╗    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
  ██║  ██║█████╗  ██║  ███╔╝ ███████║    ██║     ██║   ██║██║  ██║█████╗  
  ██║  ██║██╔══╝  ██║ ███╔╝  ██╔══██║    ██║     ██║   ██║██║  ██║██╔══╝  
  ██████╔╝███████╗██║███████╗██║  ██║    ╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚══════╝╚═╝╚══════╝╚═╝  ╚═╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝${C.reset}
  ${C.gray}Autonomous Terminal Coding Agent · v1.0.0${C.reset}
`;

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
  // Highlights backticks `code` in terminal
  return text
    .replace(/`([^`]+)`/g, `${C.gold}$1${C.reset}`)
    .replace(/\*\*([^*]+)\*\*/g, `${C.bold}$1${C.reset}`);
}

const COMMANDS_REGISTRY = [
  { cmd: '/plan', args: '[query]', desc: 'Modo arquitectura: exploración y blueprint sin editar archivos', cat: 'Modos' },
  { cmd: '/build', args: '[query]', desc: 'Modo implementación: edición quirúrgica, diffs y tests activos', cat: 'Modos' },
  { cmd: '/mode', args: '[plan|build]', desc: 'Alternar entre modo BUILD y PLAN', cat: 'Modos' },
  { cmd: '/agent', args: '<rol> <tarea>', desc: 'Lanzar un subagente worker aislado (ej: Auditor, Tester)', cat: 'Agentes' },
  { cmd: '/image', args: '<ruta> [inst]', desc: 'Analizar capturas o maquetas con visión multimodal AWS', cat: 'Herramientas' },
  { cmd: '/whoami', args: '', desc: 'Ver estado de tu cuenta, plan, tokens y cuota activa', cat: 'Cuenta' },
  { cmd: '/usage', args: '', desc: 'Consultar consumo de tokens y ventana rodante de 5 horas', cat: 'Cuenta' },
  { cmd: '/update', args: '', desc: 'Comprobar y actualizar Deiza Code a la última versión', cat: 'Sistema' },
  { cmd: '/model', args: '[id]', desc: 'Consultar o alternar modelos de IA disponibles', cat: 'Configuración' },
  { cmd: '/endpoint', args: '[url]', desc: 'Conectar a otro endpoint de IA (Ollama, vLLM, OpenAI)', cat: 'Configuración' },
  { cmd: '/config', args: '', desc: 'Ver o modificar directivas y configuración local', cat: 'Configuración' },
  { cmd: '/init', args: '', desc: 'Inicializar directivas .deizarules en la raíz del repo', cat: 'Proyecto' },
  { cmd: '/clear', args: '', desc: 'Limpiar contexto de la conversación actual', cat: 'Sesión' },
  { cmd: '/login', args: '', desc: 'Iniciar sesión (Navegador Web o API Key manual)', cat: 'Cuenta' },
  { cmd: '/logout', args: '', desc: 'Cerrar sesión en esta máquina', cat: 'Cuenta' },
  { cmd: '/help', args: '', desc: 'Ver guía completa de comandos y ejemplos de uso', cat: 'Ayuda' },
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
function renderWhoami({ email, plan, apiKey, apiBase, usage, currentMode }) {
  const isCustom = !apiBase.includes('deiza.org');
  const usedPct = usage && usage.token_limit > 0 ? Math.round((usage.tokens_used / usage.token_limit) * 100) : 0;
  const mins = usage?.reset_in_seconds ? Math.ceil(usage.reset_in_seconds / 60) : 0;
  const resetText = mins > 0 ? `Se reinicia en ${Math.floor(mins / 60)}h ${mins % 60}m` : '0% (se iniciará al enviar un mensaje)';
  const keySnippet = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : 'No configurada';

  let content = '';
  content += `${C.white}Cuenta / Usuario:${C.reset}   ${C.bold}${email || 'Conectada'}${C.reset}\n`;
  content += `${C.white}Plan de Suscripción:${C.reset} ${C.granateBold}[${(plan || 'pro').toUpperCase()}]${C.reset} (Acceso completo Deiza Code)\n`;
  content += `${C.white}Conexión:${C.reset}           ${isCustom ? `${C.gold}Endpoint Personalizado${C.reset}` : `${C.green}Nativo Deiza.org${C.reset}`}\n`;
  content += `${C.white}API Key Guardada:${C.reset}   ${C.gray}${keySnippet}${C.reset}\n`;
  content += `${C.white}Modo Terminal:${C.reset}      ${currentMode === 'plan' ? `${C.cyan}[PLAN] (Arquitectura segura)` : `${C.rose}[BUILD] (Edición quirúrgica)`}${C.reset}\n`;
  if (!isCustom && usage) {
    content += `${C.white}Tokens Utilizados:${C.reset}  ${usage.tokens_used.toLocaleString()} / ${usage.token_limit.toLocaleString()} (${usedPct}%)\n`;
    content += `${C.white}Ventana 5 Horas:${C.reset}    ${C.gray}${resetText}${C.reset}\n`;
  }
  content += `${C.white}Motor de Inferencia:${C.reset} ${C.granateBright}Deiza Omniscient${C.reset} ${C.gray}[Liquid 5.1 · Amazon AWS Dedicated Cluster]${C.reset}`;

  return box('Perfil de Usuario — Deiza Code', content, C.granate);
}

module.exports = {
  C,
  BANNER,
  Status,
  renderDiff,
  box,
  highlightMarkdown,
  COMMANDS_REGISTRY,
  renderCommandPalette,
  renderWhoami,
};

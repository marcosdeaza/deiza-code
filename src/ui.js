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

module.exports = {
  C,
  BANNER,
  Status,
  renderDiff,
  box,
  highlightMarkdown,
};

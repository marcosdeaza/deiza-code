/**
 * Capu — la mascota de Deiza Code, en la terminal.
 *
 * Un capullo de rosa hecho bloque: ocho píxeles de ancho, el pétalo izquierdo más alto y dos ojos
 * que son huecos. En la terminal se pinta con medios bloques (un carácter = 1×2 píxeles), así que
 * ocupa 8 columnas y 5 filas. La versión animada con props (portátil, café, lata, pato de goma)
 * vive en la app de escritorio y en deiza.org; aquí están el retrato, sus frases y /capu.
 *
 * Como en la app, cada modelo tiene su Capu: Gas es pequeño y violeta (6 columnas, con una voluta
 * de vapor), Liquid es el de siempre y Solid un granate tallado, más grande (10 × 6) y con vetas de oro.
 */

const fs = require('fs');
const path = require('path');

const CAPU_RGB = {
  X: [192, 74, 86],    // cuerpo
  x: [154, 55, 67],    // lado
  R: [240, 154, 166],  // flor
  L: [148, 176, 124],  // hoja
  F: [201, 82, 95],    // canto iluminado (Solid)
  Y: [231, 180, 71],   // veta de oro (Solid)
  y: [194, 139, 44],   // veta de oro en sombra (Solid)
  u: [217, 197, 242],  // vapor (Gas)
  W: [244, 236, 225],  // cejas blancas (modo abuelo)
  C: [110, 68, 49],    // bastón (modo abuelo)
  c: [142, 91, 64],    // puño del bastón (modo abuelo)
};

const CAPU_POSES = {
  idle: [
    'XX......',
    'XXX.XX..',
    'XXXXXXXx',
    'XXXXXXXx',
    'XX.XX.Xx',
    'XX.XX.Xx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    '.X....X.',
  ],
  blink: [
    'XX......',
    'XXX.XX..',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XX.XX.Xx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    '.X....X.',
  ],
  look: [
    'XX......',
    'XXX.XX..',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXX.XX.x',
    'XXX.XX.x',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    '.X....X.',
  ],
  bloom: [
    'X.R..R.X',
    'XRRRRRRX',
    'XXXXXXXx',
    'XXXXXXXx',
    'XX.XX.Xx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    '.X....X.',
  ],
  wilt: [
    '........',
    'XXX.X...',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XX.XX.Xx',
    'XXXXXXXx',
    'XXXXXXXx',
    'XXXXXXXx',
    '.X....X.',
  ],
};

// Gas: 6 × 10 with the wisp of vapour; Solid: 10 × 12. Eyes always fall on one terminal line.
const GAS_POSES = {
  idle: ['......', '..u...', '.u....', 'XX....', 'XX.XX.', 'XXXXXx', 'X.XX.x', 'X.XX.x', 'XXXXXx', '.X..X.'],
  blink: ['......', '..u...', '.u....', 'XX....', 'XX.XX.', 'XXXXXx', 'XXXXXx', 'X.XX.x', 'XXXXXx', '.X..X.'],
  look: ['......', '.u....', '..u...', 'XX....', 'XX.XX.', 'X.XX.x', 'X.XX.x', 'XXXXXx', 'XXXXXx', '.X..X.'],
  bloom: ['......', '......', '......', 'XR..RX', 'XRRRRX', 'XXXXXx', 'XXXXXx', 'X.XX.x', 'XXXXXx', '.X..X.'],
  wilt: ['......', '......', '......', '......', 'XX.X..', 'XXXXXx', 'XXXXXx', 'X.XX.x', 'XXXXXx', '.X..X.'],
};
const SOLID_BODY = (eyes) => {
  const open = 'FXX.XX.XXx', shut = 'FXXXXXXXXx';
  const e = eyes === 'closed' ? [shut, shut, open] : eyes === 'up' ? [open, open, shut] : [shut, open, open];
  return ['FXXXXXXXyx', 'FXXXXXXXYx', ...e, 'FXXXXXXXXx', 'FyXXXXXXXx', 'FXYXXXXXXx', '.XX....XX.'];
};
const SOLID_POSES = {
  idle: ['XX........', 'XXX..XX...', 'XXXX.XXX.X', ...SOLID_BODY('open')],
  blink: ['XX........', 'XXX..XX...', 'XXXX.XXX.X', ...SOLID_BODY('closed')],
  look: ['XX........', 'XXX..XX...', 'XXXX.XXX.X', ...SOLID_BODY('up')],
  bloom: ['X.RR..RR.X', 'XRRRRRRRRX', 'XXRRRRRRXx', ...SOLID_BODY('closed')],
  wilt: ['..........', '..........', 'XXX.XX.X..', ...SOLID_BODY('closed')],
};
const CAPU_FORMS = {
  liquid: { poses: CAPU_POSES, rgb: {} },
  gas: { poses: GAS_POSES, rgb: { X: [156, 108, 203], x: [122, 76, 168], R: [238, 220, 251] } },
  solid: { poses: SOLID_POSES, rgb: { X: [169, 51, 63], x: [123, 33, 48] } },
};

// Modo abuelo, for retired models that can still be used (Gas 4.5, Liquid 5.1): the same Capu,
// faded, with white eyebrows, a gold monocle and a cane on the left.
const OLD_RGB = {
  liquid: { X: [176, 100, 108], x: [138, 76, 84] },
  gas: { X: [160, 138, 186], x: [125, 104, 152], R: [238, 220, 251] },
  solid: { X: [154, 72, 82], x: [114, 52, 62], F: [178, 101, 112] },
};
const isBody = (c) => c === 'X' || c === 'x' || c === 'F';
function oldRows(rows) {
  const eyes = [];
  rows.forEach((r, y) => {
    if (!isBody(r[0]) || !isBody(r[r.length - 1])) return;
    // an eye is a hole with body on both sides and above it (crest notches have sky above)
    for (let x = 1; x < r.length - 1; x++) {
      if (r[x] === '.' && isBody(r[x - 1]) && isBody(r[x + 1]) && rows[y - 1] && isBody(rows[y - 1][x])) eyes.push([x, y]);
    }
  });
  const grid = rows.map(r => r.split(''));
  if (eyes.length) {
    const top = Math.min(...eyes.map(e => e[1]));
    const left = Math.min(...eyes.map(e => e[0])), right = Math.max(...eyes.map(e => e[0]));
    for (const x of [left, right]) if (grid[top - 1] && isBody(grid[top - 1][x])) grid[top - 1][x] = 'W';
    for (const y of [top, top + 1]) if (grid[y] && isBody(grid[y][right + 1])) grid[y][right + 1] = 'Y';
  }
  const hook = Math.max(2, rows.length - 6);
  return grid.map((r, y) => {
    const cane = y < hook ? '...' : y === hook ? 'cc.' : y === hook + 1 ? 'cC.' : '.C.';
    return cane + r.join('');
  });
}
for (const base of ['liquid', 'gas', 'solid']) {
  const f = CAPU_FORMS[base];
  const poses = {};
  for (const [name, rows] of Object.entries(f.poses)) poses[name] = oldRows(rows);
  CAPU_FORMS[`${base}:old`] = { poses, rgb: { ...f.rgb, ...OLD_RGB[base] } };
}

// Pinned ids of retired generations that can still be used.
const CAPU_LEGACY = /gas-4\.5|liquid-5\.1|liquid-4\.5/;
/** The Capu of a model: Gas and Solid have their own; Liquid and any other engine get the usual one.
 *  A retired generation that is still available gets the same Capu in old mode. */
function capuForm(model) {
  const m = String(model || '').toLowerCase();
  const base = /gas/.test(m) ? 'gas' : /solid/.test(m) ? 'solid' : 'liquid';
  return CAPU_LEGACY.test(m) ? `${base}:old` : base;
}

const capuColorOk = () => process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

/** The pose as terminal lines (Liquid 8 × 5, Gas 6 × 5, Solid 10 × 6). */
function capuLines(pose = 'idle', form = 'liquid') {
  const f = CAPU_FORMS[form] || CAPU_FORMS.liquid;
  const rows = f.poses[pose] || f.poses.idle;
  const rgb = { ...CAPU_RGB, ...f.rgb };
  const color = capuColorOk();
  const fg = (c) => `\x1b[38;2;${rgb[c].join(';')}m`;
  const bg = (c) => `\x1b[48;2;${rgb[c].join(';')}m`;
  const out = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = '';
    let last = '';
    for (let x = 0; x < rows[y].length; x++) {
      const a = rows[y][x] === '.' ? null : rows[y][x];
      const b = rows[y + 1] && rows[y + 1][x] !== '.' ? rows[y + 1][x] : null;
      if (!color) { line += a && b ? '█' : a ? '▀' : b ? '▄' : ' '; continue; }
      let code, ch;
      if (!a && !b) { code = '\x1b[0m'; ch = ' '; }
      else if (a && b && a === b) { code = `\x1b[0m${fg(a)}`; ch = '█'; }
      else if (a && b) { code = `${fg(a)}${bg(b)}`; ch = '▀'; }
      else if (a) { code = `\x1b[0m${fg(a)}`; ch = '▀'; }
      else { code = `\x1b[0m${fg(b)}`; ch = '▄'; }
      if (code !== last) { line += code; last = code; }
      line += ch;
    }
    out.push(color ? `${line}\x1b[0m` : line);
  }
  return out;
}

/** Capu on the left, up to five lines of text on the right. */
function capuBeside(textLines, pose = 'idle', indent = '  ', form = 'liquid') {
  const art = capuLines(pose, form);
  const width = ((CAPU_FORMS[form] || CAPU_FORMS.liquid).poses.idle[0] || '').length;
  const n = Math.max(art.length, textLines.length);
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(`${indent}${art[i] || ' '.repeat(width)}   ${textLines[i] || ''}`);
  return lines.join('\n');
}

// What Capu is up to while the engine works: innocence plus the classic programmer memes.
const CAPU_PHRASES = {
  thinking: [
    'Pensando', 'Regando el capullo', 'Soplando el café', 'Preguntándole al pato de goma',
    'Leyendo la documentación que nadie lee', 'Buscando el punto y coma perdido', 'Abriendo otra lata',
    'Contando las llaves', 'Mirando al techo con determinación', 'Negociando con el linter',
  ],
  writing: [
    'Escribiendo', 'Tecleando con las hojas', 'Pegando pegatinas en el portátil', 'Nombrando variables con cariño',
    'Indentando a mano', 'Quitando el console.log número 47',
  ],
  running: [
    'Ejecutando', 'Mirando la barra de progreso', 'Esperando a que compile', 'Dándole a npm install un momento',
    'Jurando que en su máquina funciona',
  ],
  reading: ['Leyendo', 'Con la lupa en el código', 'Siguiendo el hilo del import'],
};

/** A label function for createSpinner: the plain verb first, then a phrase every few seconds. */
function capuLabel(kind = 'thinking', first) {
  const list = CAPU_PHRASES[kind] || CAPU_PHRASES.thinking;
  const start = Date.now();
  let pick = 0;
  let lastSwap = start;
  return () => {
    const now = Date.now();
    if (now - start < 4000) return first || list[0];
    if (now - lastSwap > 3500 || pick === 0) {
      lastSwap = now;
      let next = pick;
      while (list.length > 1 && next === pick) next = 1 + Math.floor(Math.random() * (list.length - 1));
      pick = next;
    }
    return `${list[pick]}…`;
  };
}

/** /capu: a short animation in place (blink, look around, bloom), as the Capu of the model in use. */
async function playCapu(form = 'liquid') {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const text = [
    '\x1b[1mCapu\x1b[0m',
    '\x1b[38;5;248mla mascota de Deiza Code\x1b[0m',
    `\x1b[38;5;244m${String(form).endsWith(':old') ? 'modelo anterior: jubilado, pero en activo' : ({ gas: 'con Gas: pequeño, violeta y ligero', solid: 'con Solid: un granate tallado, más grande' }[form] || 'un capullo de rosa hecho bloque')}\x1b[0m`,
    '\x1b[38;5;244mflorece cuando terminas algo\x1b[0m',
  ];
  if (!process.stdout.isTTY) { console.log(capuBeside(text, 'idle', '  ', form)); return; }
  const seq = [['idle', 700], ['blink', 120], ['idle', 600], ['look', 700], ['idle', 400], ['blink', 120], ['idle', 300], ['bloom', 1400], ['idle', 200]];
  process.stdout.write('\n');
  let first = true;
  const height = Math.max(text.length, capuLines('idle', form).length);
  for (const [pose, ms] of seq) {
    if (!first) process.stdout.write(`\x1b[${height}A`);
    first = false;
    process.stdout.write(capuBeside(text, pose, '  ', form).split('\n').map(l => `\x1b[2K${l}`).join('\n') + '\n');
    await sleep(ms);
  }
  process.stdout.write('\n');
}

/**
 * Courtesy margin (usage limit reached mid-task): the engine is told to leave DEIZA_HANDOFF.md.
 * If it did not manage to, write one from the session so nothing is lost.
 */
function ensureHandoff({ startedAt, userInput, files = [], commands = [], messages = [], mode = 'build' }) {
  const file = path.join(process.cwd(), 'DEIZA_HANDOFF.md');
  try {
    const st = fs.statSync(file);
    if (st.mtimeMs >= startedAt - 1000) return { path: file, by: 'agent' };
  } catch { /* not there yet */ }
  const lastText = [...messages].reverse().find(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim());
  const date = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const md = [
    '# Traspaso de Deiza Code',
    '',
    `Sesión cortada por el límite de uso el ${date}. Este resumen lo ha escrito el CLI a partir de la sesión porque el agente no llegó a dejar el suyo.`,
    '',
    '## Objetivo',
    String(userInput || '').trim().slice(0, 2000) || '(sin descripción)',
    '',
    '## Cambios hechos en la última petición',
    files.length ? files.map(f => `- ${f}`).join('\n') : '- Ningún archivo modificado.',
    '',
    ...(commands.length ? ['## Comandos ejecutados', commands.map(c => `- \`${String(c).replace(/`/g, "'")}\``).join('\n'), ''] : []),
    '## Última respuesta del agente',
    lastText ? String(lastText.content).trim().slice(0, 3000) : '(sin texto)',
    '',
    '## Pendiente',
    '- [ ] Revisar que los archivos listados arriba están completos y funcionan.',
    '- [ ] Terminar lo que pedía el objetivo.',
    '',
    '## Cómo continuar',
    'Abre una sesión nueva en esta carpeta y pega:',
    '',
    '```text',
    'Continúa el trabajo descrito en DEIZA_HANDOFF.md. Revisa primero el estado de los archivos que lista, termina lo pendiente y actualiza el traspaso al acabar.',
    '```',
    '',
  ].join('\n');
  if (mode === 'plan') return { path: '', by: 'cli', content: md };
  fs.writeFileSync(file, md, 'utf8');
  return { path: file, by: 'cli' };
}

module.exports = { CAPU_POSES, CAPU_FORMS, capuForm, capuLines, capuBeside, CAPU_PHRASES, capuLabel, playCapu, ensureHandoff };

const assert = require('assert');
const { C, createMarkdownStream, printToolCard, box, highlightMarkdown } = require('../src/ui');

console.log('Running TUI and High-Contrast UI Tests...\n');

// 1. Palette check
assert(C.bold.includes('97m'), 'C.bold must contain bright white escape sequence (97m)');
assert(C.white.includes('254m') || C.white.includes('97m'), 'C.white must be crisp ANSI white');
assert(C.guide.includes('240m'), 'C.guide must be distinct container guide');
assert(C.granateBold.includes('197m'), 'C.granateBold must be high-visibility crimson');
console.log('✓ Palette ANSI 256 tests passed.');

// 2. Markdown Stream tests
let rendered = '';
const stream = createMarkdownStream((chunk) => { rendered += chunk; });

stream.write('Este es un párrafo con **texto en negrita** y también `const x = 100;` como código.\n\n');
stream.write('## Título de Sección\n');
stream.write('- Tarea 1 con **urgente**\n');
stream.write('1. Paso uno\n');
stream.write('```javascript\nconsole.log("hello");\n```\n');
stream.flush();

assert(rendered.includes(C.brightWhite), 'Rendered output must contain bright white for bold');
assert(rendered.includes('texto en negrita'), 'Rendered output must contain bold content');
assert(!rendered.includes('**texto en negrita**'), 'Rendered output must NOT contain raw asterisks');
assert(rendered.includes(C.cyan), 'Rendered output must contain cyan for inline code');
assert(rendered.includes('╭─') && rendered.includes('╰─'), 'Rendered output must contain code block frames');
console.log('✓ Markdown real-time parser tests passed.');

// 3. Tool Card tests
let cardOutput = '';
const origWrite = process.stdout.write;
process.stdout.write = (str) => { cardOutput += str; return true; };

printToolCard({
  verb: '$ [bash]',
  color: C.gold,
  target: 'npm test',
  lines: ['> 12 tests passed'],
  status: '✓ exit 0',
  isError: false,
  durationMs: 450,
});

process.stdout.write = origWrite;

assert(cardOutput.includes('╭─') && cardOutput.includes('$ [bash]'), 'Tool card must have rounded top header and verb');
assert(cardOutput.includes('│') && cardOutput.includes('> 12 tests passed'), 'Tool card must format lines with guide rail');
assert(cardOutput.includes('╰─') && cardOutput.includes('✓ exit 0'), 'Tool card must have rounded footer with status');
console.log('✓ Structured tool card container tests passed.');

console.log('\nAll 3 TUI test suites PASSED with 100% success!\n');

const assert = require('assert');

// Test paste accumulator logic directly
let pasteBuffer = [];
let pasteTimer = null;
let inBracketedPaste = false;
let received = [];

function handleSubmittedInput(input) {
  received.push(input);
}

function flushPasteBuffer() {
  if (pasteTimer) { clearTimeout(pasteTimer); pasteTimer = null; }
  if (pasteBuffer.length === 0) return;
  const lines = pasteBuffer;
  pasteBuffer = [];
  inBracketedPaste = false;
  const combined = lines.join('\n').trim();
  if (!combined) return;
  handleSubmittedInput(combined);
}

function onLine(line) {
  const raw = (line || '').replace(/\r/g, '');
  if (raw.includes('\x1b[200~')) inBracketedPaste = true;
  const cleanLine = raw.replace(/\x1b\[20[01]~/g, '');
  const hadEndMarker = raw.includes('\x1b[201~');
  if (hadEndMarker) inBracketedPaste = false;

  pasteBuffer.push(cleanLine);
  if (pasteTimer) clearTimeout(pasteTimer);

  if (hadEndMarker && !inBracketedPaste) {
    flushPasteBuffer();
  } else {
    pasteTimer = setTimeout(flushPasteBuffer, 30);
  }
}

// Test 1: Rapid burst of 80 lines (simulating paste without bracketed paste)
for (let i = 1; i <= 80; i++) {
  onLine(`Instrucción línea ${i} de código`);
}

setTimeout(() => {
  assert.strictEqual(received.length, 1, 'Debió recibir exactamente 1 instrucción en lugar de 80');
  assert.strictEqual(received[0].split('\n').length, 80, 'La instrucción debió contener las 80 líneas');
  assert(received[0].startsWith('Instrucción línea 1'), 'Debe empezar por línea 1');
  assert(received[0].endsWith('Instrucción línea 80 de código'), 'Debe terminar con línea 80');
  console.log('✓ Test 1: Ráfaga de 80 líneas unificada con éxito en 1 instrucción.');

  // Test 2: Bracketed paste with 10 lines
  received = [];
  onLine('\x1b[200~Línea bracketed 1');
  for (let i = 2; i <= 9; i++) onLine(`Línea bracketed ${i}`);
  onLine('Línea bracketed 10\x1b[201~');

  assert.strictEqual(received.length, 1, 'Bracketed paste debió recibir 1 instrucción');
  assert.strictEqual(received[0].split('\n').length, 10, 'Debió tener 10 líneas');
  assert(!received[0].includes('\x1b[200~'), 'No debe contener escape de inicio');
  assert(!received[0].includes('\x1b[201~'), 'No debe contener escape de fin');
  console.log('✓ Test 2: Bracketed paste unificado instantáneamente sin escapes residuales.');

  console.log('\nTodos los tests de multilínea pasaron con éxito (100%).');
}, 60);

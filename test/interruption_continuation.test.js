const assert = require('node:assert/strict');
const { sanitizeHistory } = require('../src/agent');
const { createTaskCompletion } = require('../src/task-completion');

// --- Test 1: Sanitize interrupted tool calls ---
const interruptedTools = [
  { role: 'user', content: 'Modifica el backend y corre los tests' },
  {
    role: 'assistant',
    content: 'Voy a editar auth.js y correr npm test',
    tool_calls: [
      { id: 'call_edit', type: 'function', function: { name: 'edit_file', arguments: '{"path":"auth.js"}' } },
      { id: 'call_test', type: 'function', function: { name: 'run_command', arguments: '{"command":"npm test"}' } }
    ]
  },
  // Only the first tool finished before the turn was aborted!
  { role: 'tool', tool_call_id: 'call_edit', content: 'Archivo modificado' }
];

sanitizeHistory(interruptedTools);
assert.equal(interruptedTools.length, 5, 'Should have 5 messages: user, assistant, tool1, tool2(repaired), assistant(closed)');
assert.equal(interruptedTools[3].role, 'tool');
assert.equal(interruptedTools[3].tool_call_id, 'call_test');
assert.equal(interruptedTools[3].content, 'Interrumpido antes de ejecutarse.');
assert.equal(interruptedTools[4].role, 'assistant');
assert.ok(interruptedTools[4].content.includes('interrumpid'), 'Closing assistant should mention interruption');

// --- Test 2: Next turn continuation ("continúa") follows strictly valid turn alternation ---
interruptedTools.push({ role: 'user', content: 'continúa con los tests' });
sanitizeHistory(interruptedTools);

for (let i = 0; i < interruptedTools.length - 1; i++) {
  const cur = interruptedTools[i];
  const next = interruptedTools[i + 1];
  if (cur.role === 'tool') {
    assert.notEqual(next.role, 'user', `Tool at index ${i} cannot be immediately followed by user`);
  }
  if (cur.role === 'user') {
    assert.notEqual(next.role, 'user', `Consecutive user turns at index ${i}`);
  }
}

// --- Test 3: Continuation words trigger actionRequested and isFollowUp after interruption ---
const completion = createTaskCompletion({
  request: 'continúa',
  mode: 'build',
  context: interruptedTools.slice(0, 5) // history before the 'continúa' message
});

const state = completion.state();
assert.equal(state.request, 'continúa');
assert.ok(completion.needsReview(''), 'Continuation turn must require review and not exit prematurely');

// --- Test 4: Merging duplicate user turns defensively ---
const dupUser = [
  { role: 'user', content: 'Primer mensaje del usuario' },
  { role: 'user', content: 'Segundo mensaje inmediato' }
];
sanitizeHistory(dupUser);
assert.equal(dupUser.length, 1);
assert.ok(dupUser[0].content.includes('Primer mensaje del usuario\n\nSegundo mensaje inmediato'));

// --- Test 5: Tool followed directly by user is repaired with intermediate assistant ---
const toolFollowedByUser = [
  { role: 'user', content: 'Paso 1' },
  { role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file' } }] },
  { role: 'tool', tool_call_id: 'c1', content: 'ok' },
  { role: 'user', content: 'Paso 2' }
];
sanitizeHistory(toolFollowedByUser);
assert.deepEqual(toolFollowedByUser.map(m => m.role), ['user', 'assistant', 'tool', 'assistant', 'user']);

console.log('✓ PASS: Interruption sanitization & continuation workflows verified 100%.');

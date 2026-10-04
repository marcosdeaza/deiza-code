const assert = require('node:assert/strict');
const { compactContext } = require('../src/agent');

// Test 1: First compaction preserves root goal and critical constraints
const firstGoal = 'Crea una app de reservas.\nRestricción imprescindible: NO usar Firebase.\nMantén el esquema hotel_v2 y moneda EUR.\nEl campo cancellation_fee es 37.';
const messages = [
  { role: 'system', content: 'Fixture system' },
  { role: 'user', content: firstGoal },
  { role: 'assistant', content: 'Decisión de arquitectura: backend PostgreSQL; no migrar hotel_v2.\nEntendido.' }
];

for (let i = 0; i < 8; i++) {
  messages.push(
    { role: 'user', content: `Iteración ${i}: cambiar botón y verificar` },
    {
      role: 'assistant',
      content: `Paso ${i} completado.`,
      tool_calls: [
        {
          id: `tc_${i}`,
          function: { name: 'edit_file', arguments: JSON.stringify({ path: `src/file_${i}.js`, content: 'fix' }) }
        }
      ]
    },
    { role: 'tool', tool_call_id: `tc_${i}`, content: 'ok' }
  );
}

const res1 = compactContext(messages, { force: true });
assert.equal(res1.compacted, true, 'First compaction should succeed');

const compactUserMsg1 = messages.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('[MEMORIA DE SESIÓN COMPACTADA'));
assert.ok(compactUserMsg1, 'Should contain compact anchor');
assert.ok(compactUserMsg1.content.includes('Crea una app de reservas'), 'Should preserve root goal');
assert.ok(compactUserMsg1.content.includes('NO usar Firebase'), 'Should preserve negative constraint NO usar Firebase');
assert.ok(compactUserMsg1.content.includes('hotel_v2'), 'Should preserve schema constraint');
assert.ok(compactUserMsg1.content.includes('cancellation_fee'), 'Should preserve critical fields');

// Test 2: Recursive compaction - second compaction MUST NOT erase previous anchor
for (let i = 8; i < 16; i++) {
  messages.push(
    { role: 'user', content: `Segunda tanda ${i}` },
    {
      role: 'assistant',
      content: `Listo paso ${i}`,
      tool_calls: [
        {
          id: `tc_${i}`,
          function: { name: 'write_file', arguments: JSON.stringify({ path: `src/extra_${i}.js`, content: 'extra' }) }
        }
      ]
    },
    { role: 'tool', tool_call_id: `tc_${i}`, content: 'ok' }
  );
}

const res2 = compactContext(messages, { force: true });
assert.equal(res2.compacted, true, 'Second compaction should succeed');

const compactUserMsg2 = messages.find(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('[MEMORIA DE SESIÓN COMPACTADA'));
assert.ok(compactUserMsg2, 'Should contain compact anchor in second compaction');
assert.ok(compactUserMsg2.content.includes('Crea una app de reservas'), 'Second compaction MUST preserve root goal from first compaction');
assert.ok(compactUserMsg2.content.includes('NO usar Firebase'), 'Second compaction MUST preserve critical constraints');
assert.ok(compactUserMsg2.content.includes('hotel_v2'), 'Second compaction MUST preserve schemas');

console.log('✓ PASS: compactContext preserves goals, rules and survives recursive compactions (100%).');

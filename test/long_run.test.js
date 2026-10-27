// A long autonomous request must not stop at the 120-round checkpoint while it keeps making progress.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROUNDS = 130;
let requests = 0;
const server = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    requests++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const delta = requests <= ROUNDS
      ? { tool_calls: [{ index: 0, id: `c${requests}`, type: 'function', function: { name: 'list_dir', arguments: '{"path":"."}' } }] }
      : { content: 'Hecho.' };
    res.write(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: requests <= ROUNDS ? 'tool_calls' : 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});

server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const cwd = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deiza-long-run-'));
  process.chdir(dir);
  const log = console.log;
  console.log = () => {};
  try {
    const { runAgentTurn } = require('../src/agent');
    const result = await runAgentTurn({
      cfg: { apiBase: `${base}/v1`, accountBase: base, isCustomEndpoint: true, endpointKey: '', model: 'test-model', toolMode: 'native' },
      messages: [], userInput: 'Revisa la carpeta muchas veces', quiet: true,
    });
    console.log = log;
    assert.ok(result.turnCount > 120, `expected more than 120 rounds, got ${result.turnCount}`);
    assert.notEqual(result.stopReason, 'max_turns');
    assert.ok(requests > ROUNDS);
    console.log(`✓ PASS: long request kept working past the checkpoint (${result.turnCount} rounds, stop=${result.stopReason}).`);
  } finally {
    console.log = log;
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
    server.close();
  }
});

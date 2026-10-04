const assert = require('node:assert/strict');
const http = require('node:http');
const { runAgentTurn } = require('../src/agent');

(async () => {
  const modelRequests = [];
  let rounds = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/v1/chat/completions') {
        const json = JSON.parse(body);
        modelRequests.push(json);
        const next = rounds.shift() || { content: 'Terminado.' };
        res.setHeader('Content-Type', 'text/event-stream');
        
        let delta = {};
        let finish_reason = 'stop';
        if (next.tool_calls) {
          delta = { tool_calls: next.tool_calls.map((c, i) => ({ index: i, id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) };
          finish_reason = 'tool_calls';
        } else if (next.content) {
          delta = { content: next.content };
        }
        return res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\ndata: [DONE]\n\n`);
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const cfg = { apiBase: url, apiKey: 'test', model: 'deiza-gas', isCustomEndpoint: false };

  try {
    // Scenario 1: Model announces action without tool call -> should be nudged and then finish
    rounds = [
      { content: 'Voy a cambiar el icono por un cohete en el archivo index.html.' },
      { content: 'Hecho, ya se cambió.' }
    ];
    const messages1 = [];
    await runAgentTurn({ cfg, messages: messages1, userInput: 'Cambia el icono', quiet: true });
    
    // Check that modelRequests had 2 calls, and the second call had the nudge prompt
    assert.equal(modelRequests.length, 2, 'Should have nudged the model on announced action');
    const secondPromptMsgs = modelRequests[1].messages;
    const lastUserNudge = secondPromptMsgs[secondPromptMsgs.length - 1];
    assert.equal(lastUserNudge.role, 'user');
    assert.ok(lastUserNudge.content.includes('Has anunciado una acción'), 'Nudge message should prompt tool execution');

    // Scenario 2: Model outputs markdown code block without mutating tools -> should be nudged
    modelRequests.length = 0;
    rounds = [
      { content: 'Aquí tienes el código:\n```html\n<span>🚀</span>\n```' },
      { content: 'Archivo guardado correctamente.' }
    ];
    const messages2 = [];
    await runAgentTurn({ cfg, messages: messages2, userInput: 'Pon el emoji en index.html', quiet: true });
    assert.equal(modelRequests.length, 2, 'Should have nudged when markdown code block output without modifying disk');
    const codeNudge = modelRequests[1].messages.at(-1);
    assert.ok(codeNudge.content.includes('Has proporcionado el código en texto markdown pero no has aplicado los cambios'));

    console.log('✓ PASS: Follow-through nudging correctly prevents premature stops (100%).');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});

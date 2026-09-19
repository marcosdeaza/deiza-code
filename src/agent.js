/**
 * DEIZA CODE — Agent Engine & LLM Client
 * Universal streaming client compatible with native Deiza API and standard OpenAI-compatible endpoints (Ollama, vLLM, OpenAI, DeepSeek).
 */

const http = require('http');
const https = require('https');
const { Tools, isCommandRisky } = require('./tools');
const { Status, C, highlightMarkdown } = require('./ui');
const { buildSystemPrompt } = require('./prompt');

/**
 * Parses XML-style tool calls from LLM output
 */
function extractToolCalls(text) {
  const regex = /<tool_call\s+name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
  const calls = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const name = match[1];
      const args = JSON.parse(match[2].trim());
      calls.push({ name, args, fullMatch: match[0] });
    } catch (err) {
      // Malformed JSON inside tool call
    }
  }
  return calls;
}

/**
 * Universal Streaming Completion
 * Supports:
 * - Native Deiza endpoint: POST /api/code/chat/stream or /api/code/chat/completions
 * - OpenAI / Ollama / LocalAI endpoint: POST /v1/chat/completions
 */
async function streamCompletion({ apiBase, apiKey, model, messages, onChunk }) {
  return new Promise((resolve, reject) => {
    const isCustom = !apiBase.includes('deiza.org');
    let endpointUrl;

    if (isCustom) {
      // Standard OpenAI / Ollama / LocalAI route
      endpointUrl = apiBase.endsWith('/chat/completions')
        ? apiBase
        : `${apiBase}/v1/chat/completions`;
    } else {
      endpointUrl = `${apiBase}/api/code/chat/stream`;
    }

    const url = new URL(endpointUrl);
    const client = url.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.2,
      max_tokens: 4096,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['X-Deiza-Key'] = apiKey;
    }

    const req = client.request(
      url,
      {
        method: 'POST',
        headers,
        timeout: 60000,
      },
      (res) => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(new Error('AUTH_EXPIRED'));
        }
        if (res.statusCode === 429) {
          return reject(new Error('USAGE_LIMIT_EXCEEDED'));
        }
        if (res.statusCode >= 400) {
          let errBody = '';
          res.on('data', c => { errBody += c; });
          res.on('end', () => reject(new Error(`API Error (${res.statusCode}): ${errBody.slice(0, 200)}`)));
          return;
        }

        let fullText = '';
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // SSE comment or empty

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices?.[0]?.delta?.content || parsed.delta || parsed.text || '';
                if (delta) {
                  fullText += delta;
                  if (onChunk) onChunk(delta);
                }
              } catch {
                // Raw string or non-JSON chunk
                fullText += dataStr;
                if (onChunk) onChunk(dataStr);
              }
            } else {
              // Direct non-SSE chunk
              try {
                const parsed = JSON.parse(trimmed);
                const delta = parsed.delta || parsed.text || '';
                if (delta) {
                  fullText += delta;
                  if (onChunk) onChunk(delta);
                }
              } catch {
                fullText += trimmed;
                if (onChunk) onChunk(trimmed);
              }
            }
          }
        });

        res.on('end', () => {
          resolve(fullText);
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Multi-turn Agentic Execution Loop
 */
async function runAgentTurn({ cfg, messages, userInput, rl, confirmCallback }) {
  // If first turn or system prompt missing, initialize system prompt
  if (messages.length === 0 || messages[0].role !== 'system') {
    messages.unshift({ role: 'system', content: buildSystemPrompt() });
  }

  messages.push({ role: 'user', content: userInput });

  console.log(Status.thinking);
  console.log(`\n${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}`);

  let turn = 0;
  const MAX_TURNS = 12;

  while (turn < MAX_TURNS) {
    turn++;
    let hasStreamed = false;

    const assistantText = await streamCompletion({
      apiBase: cfg.apiBase,
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages,
      onChunk: (chunk) => {
        // Strip out XML tool tags from live stream so output remains pristine
        if (!hasStreamed) {
          process.stdout.write('\n');
          hasStreamed = true;
        }
        process.stdout.write(chunk);
      },
    });

    process.stdout.write('\n');
    messages.push({ role: 'assistant', content: assistantText });

    const toolCalls = extractToolCalls(assistantText);
    if (toolCalls.length === 0) {
      // No tool calls: task completed
      console.log(Status.success);
      break;
    }

    // Process and execute tool calls
    for (const call of toolCalls) {
      const fn = Tools[call.name];
      if (!fn) {
        messages.push({
          role: 'user',
          content: `<tool_response name="${call.name}">Error: Unknown tool "${call.name}"</tool_response>`,
        });
        continue;
      }

      // Live status display
      if (call.name === 'run_command') {
        const cmd = call.args.command;
        if (isCommandRisky(cmd) && confirmCallback) {
          const approved = await confirmCallback(`¿Ejecutar comando riesgoso "${cmd}"? [s/N]: `);
          if (!approved) {
            messages.push({
              role: 'user',
              content: `<tool_response name="${call.name}">Comando cancelado por el usuario.</tool_response>`,
            });
            continue;
          }
        }
        console.log(Status.executing(cmd));
      } else if (call.name === 'edit_file') {
        console.log(Status.editing(call.args.path));
      } else if (call.name === 'write_file') {
        console.log(Status.writing(call.args.path));
      } else if (call.name === 'read_file') {
        console.log(Status.reading(call.args.path));
      } else if (call.name === 'list_dir') {
        console.log(Status.listing(call.args.path || '.'));
      } else if (call.name === 'search_files') {
        console.log(Status.searching(call.args.query));
      } else {
        console.log(`  ${C.granateBold}● [${call.name}]${C.reset} ${C.gray}${JSON.stringify(call.args)}${C.reset}`);
      }

      const result = await fn(call.args);
      messages.push({
        role: 'user',
        content: `<tool_response name="${call.name}">\n${JSON.stringify(result, null, 2)}\n</tool_response>`,
      });
    }
  }

  console.log(`${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}\n`);
}

module.exports = {
  extractToolCalls,
  streamCompletion,
  runAgentTurn,
};

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
                if (parsed.usage) usage = parsed.usage;
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
                if (parsed.usage) usage = parsed.usage;
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
          const ret = new String(fullText);
          ret.text = fullText;
          ret.usage = usage;
          resolve(ret);
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
async function runAgentTurn({ cfg, messages, userInput, rl, confirmCallback, mode = 'build', images = [] }) {
  // If first turn or system prompt missing, initialize system prompt with current mode
  if (messages.length === 0 || messages[0].role !== 'system') {
    messages.unshift({ role: 'system', content: buildSystemPrompt(mode) });
  } else {
    // Keep mode updated in system prompt
    messages[0].content = buildSystemPrompt(mode);
  }

  // Multimodal image support
  if (images && images.length > 0) {
    const multimodalContent = [{ type: 'text', text: userInput }];
    for (const img of images) {
      const url = typeof img === 'string' ? img : (img.data_url || img.dataUrl || img.base64 || img.url);
      multimodalContent.push({
        type: 'image_url',
        image_url: { url },
      });
    }
    messages.push({ role: 'user', content: multimodalContent });
  } else {
    messages.push({ role: 'user', content: userInput });
  }

  console.log(Status.thinking);
  console.log(`\n${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}`);

  let turn = 0;
  let totalToolsExecuted = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const MAX_TURNS = 12;

  while (turn < MAX_TURNS) {
    turn++;
    let hasStreamed = false;

    // Estimate input tokens from current messages length as baseline
    const promptLen = JSON.stringify(messages).length;
    const estPromptTok = Math.max(1, Math.ceil(promptLen / 3.8));

    const assistantResult = await streamCompletion({
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

    const assistantText = assistantResult?.text || assistantResult?.toString() || '';
    const chunkUsage = assistantResult?.usage;

    totalPromptTokens += Number(chunkUsage?.prompt_tokens || estPromptTok);
    totalCompletionTokens += Number(chunkUsage?.completion_tokens || Math.max(1, Math.ceil(assistantText.length / 3.8)));

    if (hasStreamed) {
      process.stdout.write('\n');
    }

    // Append raw assistant response to conversation history
    messages.push({ role: 'assistant', content: assistantText });

    // Parse any tool calls
    const toolCalls = extractToolCalls(assistantText);
    if (toolCalls.length === 0) {
      // Agent finished its thought process without needing more tools
      console.log(Status.success);
      break;
    }

    // Execute tool calls sequentially
    for (const call of toolCalls) {
      const fn = Tools[call.name];
      if (!fn) {
        messages.push({
          role: 'user',
          content: `<tool_response name="${call.name}">Error: Herramienta '${call.name}' no reconocida.</tool_response>`,
        });
        continue;
      }

      // Check mode permissions: PLAN mode cannot write, edit, or run bash
      if (mode === 'plan') {
        const mutatingTools = ['edit_file', 'write_file', 'run_command'];
        if (mutatingTools.includes(call.name)) {
          console.log(`  ${C.cyan}🔒 [PLAN MODE]${C.reset} ${C.gray}Simulando acción ${call.name} sin modificar el disco...${C.reset}`);
          messages.push({
            role: 'user',
            content: `<tool_response name="${call.name}">[PLAN MODE SIMULATION] La acción ${call.name} fue interceptada en modo PLAN. Planifica la arquitectura sin modificar archivos.</tool_response>`,
          });
          continue;
        }
      }

      // User safety confirmation for bash execution
      if (call.name === 'run_command') {
        const cmd = call.args.command || '';
        if (isCommandRisky(cmd) && confirmCallback) {
          const approved = await confirmCallback(`¿Autorizas ejecutar este comando bash? -> ${C.gold}${cmd}${C.reset} [S/n]: `);
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
      } else if (call.name === 'invoke_subagent') {
        console.log(Status.subagent(call.args.role || 'Worker', call.args.task));
      } else if (call.name === 'view_image') {
        console.log(Status.vision(call.args.path));
      } else {
        console.log(`  ${C.granateBold}● [${call.name}]${C.reset} ${C.gray}${JSON.stringify(call.args)}${C.reset}`);
      }

      totalToolsExecuted++;
      const result = await fn(call.args, { cfg, mode, messages, streamCompletion });
      messages.push({
        role: 'user',
        content: `<tool_response name="${call.name}">\n${JSON.stringify(result, null, 2)}\n</tool_response>`,
      });
    }
  }

  console.log(`${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}\n`);

  return {
    turnCount: turn,
    toolsExecuted: totalToolsExecuted,
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };
}

module.exports = {
  extractToolCalls,
  streamCompletion,
  runAgentTurn,
};

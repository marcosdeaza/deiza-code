/**
 * DEIZA CODE — Agent Engine & LLM Client
 * Streaming client for the native Deiza API (OpenAI-compatible SSE) and for any
 * OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, OpenAI, DeepSeek...).
 */

const http = require('http');
const https = require('https');
const { StringDecoder } = require('string_decoder');
const { Tools, isCommandRisky, isCommandCatastrophic, previewChange } = require('./tools');
const { Status, C } = require('./ui');
const { buildSystemPrompt } = require('./prompt');
const { isDeizaHost } = require('./config');

const MAX_TURNS = 24;
const MAX_CONTEXT_CHARS = 700000; // ~175k tokens: trims old tool output before the model chokes

/**
 * Parses XML-style tool calls from LLM output
 */
function extractToolCalls(text) {
  const regex = /<tool_call\s+name="([^"]+)"\s*>([\s\S]*?)<\/tool_call>/g;
  const calls = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    let body = match[2].trim();
    // Models sometimes wrap the JSON in a code fence
    body = body.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const args = body ? JSON.parse(body) : {};
      calls.push({ name, args, fullMatch: match[0] });
    } catch {
      calls.push({ name, args: null, fullMatch: match[0], parseError: true });
    }
  }
  return calls;
}

/**
 * Resolve the chat completions URL for a base URL.
 *   https://deiza.org                  -> https://deiza.org/api/code/chat/completions
 *   http://localhost:11434             -> http://localhost:11434/v1/chat/completions
 *   https://host/v1                    -> https://host/v1/chat/completions
 *   https://host/v1/chat/completions   -> unchanged
 */
function completionsUrl(apiBase) {
  const base = String(apiBase || '').replace(/\/+$/, '');
  if (isDeizaHost(base)) return `${base}/api/code/chat/completions`;
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v\d+$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function describeApiError(status, body) {
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    const err = parsed.error;
    detail = typeof err === 'string' ? err : (err?.message || parsed.message || parsed.detail || '');
    if (detail === 'plan_required' || err?.type === 'plan_required') return 'PLAN_REQUIRED';
    if (detail === 'usage_limit' || detail === 'model_sublimit') return 'USAGE_LIMIT_EXCEEDED';
  } catch {
    detail = String(body || '').slice(0, 200);
  }
  return `API Error (${status})${detail ? `: ${detail}` : ''}`;
}

/**
 * Universal streaming completion. Resolves to { text, usage }.
 */
async function streamCompletion({ apiBase, apiKey, model, messages, onChunk, maxTokens = 8192, temperature = 0.2 }) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(completionsUrl(apiBase));
    } catch {
      return reject(new Error(`Endpoint no válido: ${apiBase}`));
    }
    const client = url.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      stream_options: { include_usage: true },
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'deiza-code',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['X-Api-Key'] = apiKey;
    }

    let usage = null;
    let fullText = '';
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err); else resolve(value);
    };

    const native = isDeizaHost(apiBase);
    const req = client.request(url, { method: 'POST', headers, timeout: 180000 }, (res) => {
      if (res.statusCode === 401 && native) return finish(new Error('AUTH_EXPIRED'));
      if ((res.statusCode === 403 || res.statusCode === 402) && native) {
        let b = '';
        res.on('data', c => { b += c; });
        res.on('end', () => finish(new Error(describeApiError(res.statusCode, b) === 'PLAN_REQUIRED' ? 'PLAN_REQUIRED' : 'AUTH_EXPIRED')));
        return;
      }
      if ((res.statusCode === 401 || res.statusCode === 403) && !native) {
        res.resume();
        return finish(new Error(`El endpoint ${url.origin} rechazó la clave (${res.statusCode}). Configúrala con --key <clave> o DEIZA_ENDPOINT_KEY, o vuelve al motor nativo con /endpoint deiza.`));
      }
      if (res.statusCode === 429) return finish(new Error('USAGE_LIMIT_EXCEEDED'));
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => { errBody += c; });
        res.on('end', () => finish(new Error(describeApiError(res.statusCode, errBody))));
        return;
      }

      let buffer = '';
      const decoder = new StringDecoder('utf8'); // multi-byte characters can be split across chunks
      const handleEvent = (dataStr) => {
        if (dataStr === '[DONE]') return;
        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          return; // keepalive or non-JSON noise
        }
        if (parsed.error) {
          const msg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || 'Error del modelo');
          throw new Error(msg);
        }
        if (parsed.usage) usage = parsed.usage;
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? parsed.delta ?? parsed.chunk ?? parsed.text ?? '';
        if (delta) {
          fullText += delta;
          if (onChunk) onChunk(delta);
        }
      };

      res.on('data', (chunk) => {
        buffer += decoder.write(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop();
        try {
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue;
            if (trimmed.startsWith('data:')) handleEvent(trimmed.slice(5).trim());
            else handleEvent(trimmed);
          }
        } catch (err) {
          req.destroy();
          finish(err);
        }
      });

      res.on('end', () => {
        buffer += decoder.end();
        if (buffer.trim()) {
          try { handleEvent(buffer.trim().replace(/^data:\s*/, '')); } catch (err) { return finish(err); }
        }
        finish(null, { text: fullText, usage });
      });
      res.on('error', (err) => finish(err));
    });

    req.on('timeout', () => { req.destroy(new Error('El modelo no respondió a tiempo (timeout).')); });
    req.on('error', (err) => finish(new Error(err.code === 'ECONNREFUSED' ? `No se pudo conectar con ${url.origin}` : err.message)));
    req.write(payload);
    req.end();
  });
}

/**
 * Keep the conversation within the model's window: drop the oldest tool exchanges first.
 */
function trimContext(messages) {
  const size = () => messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length), 0);
  while (messages.length > 3 && size() > MAX_CONTEXT_CHARS) {
    // index 0 is the system prompt; drop the oldest non-system message
    messages.splice(1, 1);
  }
}

/**
 * Streaming filter that hides <tool_call>...</tool_call> blocks from the live terminal output
 * (the model still emits them; they are parsed from the full text afterwards).
 */
function createToolCallFilter() {
  const OPEN = '<tool_call';
  const CLOSE = '</tool_call>';
  let pending = '';
  let inside = false;
  return (chunk) => {
    pending += chunk;
    let out = '';
    while (pending.length) {
      if (inside) {
        const end = pending.indexOf(CLOSE);
        if (end === -1) { pending = pending.slice(-CLOSE.length); return out; }
        pending = pending.slice(end + CLOSE.length);
        inside = false;
        continue;
      }
      const start = pending.indexOf(OPEN);
      if (start !== -1) {
        out += pending.slice(0, start);
        pending = pending.slice(start);
        inside = true;
        continue;
      }
      // Hold back a tail that could be the beginning of "<tool_call"
      let keep = 0;
      for (let n = Math.min(OPEN.length - 1, pending.length); n > 0; n--) {
        if (OPEN.startsWith(pending.slice(-n))) { keep = n; break; }
      }
      out += pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      return out;
    }
    return out;
  };
}

function toolLabel(call) {
  const a = call.args || {};
  switch (call.name) {
    case 'run_command': return Status.executing(a.command || '');
    case 'edit_file': return Status.editing(a.path);
    case 'write_file': return Status.writing(a.path);
    case 'read_file': return Status.reading(a.path);
    case 'list_dir': return Status.listing(a.path || '.');
    case 'search_files': return Status.searching(a.query);
    case 'invoke_subagent': return Status.subagent(a.role || 'Worker', a.task);
    case 'view_image': return Status.vision(a.path);
    default: return `  ${C.granateBold}● [${call.name}]${C.reset} ${C.gray}${JSON.stringify(a)}${C.reset}`;
  }
}

/**
 * Multi-turn agentic loop.
 *   mode = 'build'   -> autonomous, no confirmations (catastrophic commands are refused)
 *   mode = 'copilot' -> every write/edit/command is previewed and approved
 *   mode = 'plan'    -> read-only, mutations are simulated
 */
async function runAgentTurn({ cfg, messages, userInput, confirmCallback, mode = 'build', images = [], quiet = false }) {
  if (messages.length === 0 || messages[0].role !== 'system') {
    messages.unshift({ role: 'system', content: buildSystemPrompt(mode) });
  } else {
    messages[0].content = buildSystemPrompt(mode);
  }

  if (images && images.length > 0) {
    const multimodalContent = [{ type: 'text', text: userInput }];
    for (const img of images) {
      const url = typeof img === 'string' ? img : (img.data_url || img.dataUrl || img.base64 || img.url);
      if (url) multimodalContent.push({ type: 'image_url', image_url: { url } });
    }
    messages.push({ role: 'user', content: multimodalContent });
  } else {
    messages.push({ role: 'user', content: userInput });
  }

  if (!quiet) {
    console.log(Status.thinking);
    console.log(`\n${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}`);
  }

  let turn = 0;
  let totalToolsExecuted = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  const mutatingTools = new Set(['edit_file', 'write_file', 'run_command']);

  while (turn < MAX_TURNS) {
    turn++;
    let hasStreamed = false;
    trimContext(messages);

    const promptLen = JSON.stringify(messages).length;
    const estPromptTok = Math.max(1, Math.ceil(promptLen / 3.8));
    const visible = createToolCallFilter();

    const result = await streamCompletion({
      apiBase: cfg.apiBase,
      apiKey: cfg.isCustomEndpoint ? (cfg.endpointKey || '') : cfg.apiKey,
      model: cfg.model,
      messages,
      onChunk: (chunk) => {
        let text = visible(chunk);
        if (!text) return;
        if (!hasStreamed) {
          text = text.replace(/^\s+/, ''); // drop the blank lines models emit around tool calls
          if (!text) return;
          process.stdout.write('\n');
          hasStreamed = true;
        }
        process.stdout.write(text);
      },
    });

    const assistantText = result?.text || '';
    const chunkUsage = result?.usage;
    totalPromptTokens += Number(chunkUsage?.prompt_tokens || estPromptTok);
    totalCompletionTokens += Number(chunkUsage?.completion_tokens || Math.max(1, Math.ceil(assistantText.length / 3.8)));

    const tail = visible('');
    if (tail.trim()) { process.stdout.write(tail); hasStreamed = true; }
    if (hasStreamed) process.stdout.write('\n');
    messages.push({ role: 'assistant', content: assistantText });

    const toolCalls = extractToolCalls(assistantText);
    if (toolCalls.length === 0) {
      if (!quiet) console.log(Status.success);
      break;
    }

    for (const call of toolCalls) {
      if (call.parseError || !call.args || typeof call.args !== 'object') {
        messages.push({
          role: 'user',
          content: `<tool_response name="${call.name}">Error: los argumentos de la herramienta no son JSON válido. Vuelve a emitir la llamada con JSON correcto (escapa saltos de línea como \\n).</tool_response>`,
        });
        continue;
      }
      const fn = Tools[call.name];
      if (!fn) {
        messages.push({
          role: 'user',
          content: `<tool_response name="${call.name}">Error: Herramienta '${call.name}' no reconocida.</tool_response>`,
        });
        continue;
      }

      if (mode === 'plan' && mutatingTools.has(call.name)) {
        const readOnlyCmd = call.name === 'run_command' && /^\s*(git\s+(status|log|diff|branch|show)|ls|dir|cat|type|pwd|npm\s+(test|run\s+(test|lint|build))|pytest|cargo\s+(check|test)|go\s+(test|vet))\b/i.test(call.args.command || '');
        if (!readOnlyCmd) {
          console.log(`  ${C.cyan}[PLAN]${C.reset} ${C.gray}Simulando ${call.name} sin tocar el disco...${C.reset}`);
          messages.push({
            role: 'user',
            content: `<tool_response name="${call.name}">[PLAN MODE] La acción ${call.name} fue interceptada: en modo PLAN no se modifica nada. Describe el cambio en el plan y continúa.</tool_response>`,
          });
          continue;
        }
      }

      if (call.name === 'run_command' && isCommandCatastrophic(call.args.command || '')) {
        console.log(`  ${C.granateBright}✖ Comando bloqueado:${C.reset} ${call.args.command}`);
        messages.push({
          role: 'user',
          content: `<tool_response name="run_command">Comando bloqueado por Deiza Code (destruiría el sistema o el disco). Busca otra forma de conseguir el objetivo.</tool_response>`,
        });
        continue;
      }

      let previewed = false;
      if (mode === 'copilot' && mutatingTools.has(call.name) && confirmCallback) {
        let approved;
        if (call.name === 'run_command') {
          const risky = isCommandRisky(call.args.command || '') ? ` ${C.granateBright}(destructivo)${C.reset}` : '';
          approved = await confirmCallback(`[COPILOT] Ejecutar${risky}: ${C.gold}${call.args.command}${C.reset} [S/n]: `);
        } else {
          const preview = previewChange(call.name, call.args);
          if (!preview.ok) {
            messages.push({ role: 'user', content: `<tool_response name="${call.name}">Error: ${preview.error}</tool_response>` });
            continue;
          }
          if (preview.diff) { process.stdout.write(preview.diff); previewed = true; }
          approved = await confirmCallback(`[COPILOT] Aplicar este cambio en ${C.white}${call.args.path}${C.reset}? [S/n]: `);
        }
        if (!approved) {
          console.log(`  ${C.gray}Cambio rechazado por el usuario.${C.reset}`);
          messages.push({
            role: 'user',
            content: `<tool_response name="${call.name}">El usuario ha RECHAZADO esta acción. No la repitas; pregunta qué prefiere o propón una alternativa.</tool_response>`,
          });
          continue;
        }
      }

      console.log(toolLabel(call));
      totalToolsExecuted++;
      const toolResult = await fn(call.args, { cfg, mode, messages, streamCompletion, quietDiff: previewed });
      let serialized = JSON.stringify(toolResult, null, 2);
      if (serialized.length > 60000) serialized = serialized.slice(0, 60000) + '\n... (salida truncada)';
      messages.push({
        role: 'user',
        content: `<tool_response name="${call.name}">\n${serialized}\n</tool_response>`,
      });
    }
  }

  if (turn >= MAX_TURNS) {
    console.log(`  ${C.gold}⚠ Se alcanzó el máximo de ${MAX_TURNS} turnos de herramientas en esta petición.${C.reset}`);
  }
  if (!quiet) console.log(`${C.granateDark}─────────────────────────────────────────────────────────────${C.reset}\n`);

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
  createToolCallFilter,
  completionsUrl,
  streamCompletion,
  runAgentTurn,
};

#!/usr/bin/env node

/**
 * DEIZA CODE — CLI Executable Entry Point
 */

const { BANNER, C, Status } = require('../src/ui');
const { loadConfig, saveConfig } = require('../src/config');
const { runLoginFlow } = require('../src/auth');
const { startRepl } = require('../src/index');
const { runAgentTurn } = require('../src/agent');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log('deiza-code v1.0.0');
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${C.granateBold}DEIZA CODE — Autonomous Terminal Coding Agent${C.reset}
Uso:
  deiza [opciones] [instrucción]
  deiza-code [opciones] [instrucción]

Opciones:
  -v, --version         Muestra la versión instalada
  -h, --help            Muestra este mensaje de ayuda
  -p, --prompt <texto>  Ejecuta una instrucción directa en modo no-interactivo
  -y, --yes             Aprueba automáticamente comandos bash sin pedir confirmación
  --login               Fuerza autenticación por navegador en deiza.org
  --model <id>          Modelo a utilizar (ej. deiza-liquid-5, gpt-4o, llama3)
  --endpoint <url>      URL base para conectar con Deiza o cualquier LLM OpenAI-compatible
  --key <apiKey>        Clave API para la sesión

Recicla Deiza Code con cualquier proyecto de IA:
  deiza --endpoint http://localhost:11434/v1 --model llama3
  deiza --endpoint https://api.openai.com/v1 --key sk-... --model gpt-4o
`);
    process.exit(0);
  }

  let cfg = loadConfig();

  // Parse CLI flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--endpoint' && args[i + 1]) {
      cfg.apiBase = args[i + 1].replace(/\/+$/, '');
      cfg.isCustomEndpoint = !cfg.apiBase.includes('deiza.org');
      i++;
    } else if (args[i] === '--model' && args[i + 1]) {
      cfg.model = args[i + 1];
      i++;
    } else if (args[i] === '--key' && args[i + 1]) {
      cfg.apiKey = args[i + 1];
      i++;
    }
  }

  // If using default Deiza and no key is configured, run browser login
  if (!cfg.isCustomEndpoint && (!cfg.apiKey || args.includes('--login'))) {
    try {
      cfg = await runLoginFlow(cfg);
    } catch (err) {
      console.error(Status.error(err.message));
      process.exit(1);
    }
  }

  // Non-interactive prompt mode (-p / --prompt or direct text argument)
  const promptIdx = args.indexOf('-p') !== -1 ? args.indexOf('-p') : args.indexOf('--prompt');
  let inlinePrompt = null;
  if (promptIdx !== -1 && args[promptIdx + 1]) {
    inlinePrompt = args[promptIdx + 1];
  } else {
    // If first argument is not a flag, treat as direct prompt
    const nonFlags = args.filter(a => !a.startsWith('-'));
    if (nonFlags.length > 0 && promptIdx === -1 && !args.includes('--login')) {
      inlinePrompt = nonFlags.join(' ');
    }
  }

  if (inlinePrompt) {
    const messages = [];
    const autoYes = args.includes('-y') || args.includes('--yes');
    try {
      await runAgentTurn({
        cfg,
        messages,
        userInput: inlinePrompt,
        confirmCallback: async () => autoYes,
      });
      process.exit(0);
    } catch (err) {
      console.error(Status.error(err.message));
      process.exit(1);
    }
  }

  // Start Interactive REPL
  await startRepl(cfg);
}

main().catch((err) => {
  console.error(`\x1b[38;2;184;74;85m✖ Error fatal:\x1b[0m ${err.message}`);
  process.exit(1);
});

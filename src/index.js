/**
 * DEIZA CODE — Interactive Terminal Coding Agent
 * Main REPL, Slash Commands, and Orchestration.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { C, BANNER, Status, box } = require('./ui');
const { loadConfig, saveConfig, DEFAULT_MODEL, DEFAULT_DEIZA_API } = require('./config');
const { runLoginFlow, fetchModels, fetchUsage } = require('./auth');
const { runAgentTurn } = require('./agent');
const { getGitContext, detectProjectType } = require('./context');

async function startRepl(initialConfig) {
  let cfg = initialConfig;

  console.clear();
  console.log(BANNER);

  // Fetch models if native deiza
  const models = await fetchModels(cfg.apiKey, cfg.apiBase);
  let activeModel = cfg.model || DEFAULT_MODEL;
  if (models.length > 0 && !models.some(m => m.id === activeModel)) {
    activeModel = models[0]?.id || activeModel;
  }
  cfg.model = activeModel;

  // Workspace Info
  const git = getGitContext();
  const projType = detectProjectType();
  const branchLabel = git.isGit ? ` · ${C.cyan}⎇ ${git.branch}${C.reset}` : '';

  // Usage info
  const usage = await fetchUsage(cfg.apiKey, cfg.apiBase);
  const plan = usage?.plan || cfg.plan || 'pro';
  const pct = usage && usage.token_limit > 0 ? Math.min(100, Math.round((usage.tokens_used / usage.token_limit) * 100)) : 0;
  const resetLabel = usage?.reset_in_seconds ? `${Math.ceil(usage.reset_in_seconds / 60)}m` : null;

  if (cfg.isCustomEndpoint) {
    console.log(`  ${C.white}Modo:${C.reset} ${C.gold}Endpoint Personalizado / OpenAI Compatible${C.reset}`);
    console.log(`  ${C.white}URL:${C.reset} ${C.gray}${cfg.apiBase}${C.reset}`);
  } else {
    if (plan === 'free') {
      console.log(`\n  ${C.granateBright}✖ Acceso restringido:${C.reset} Deiza Code requiere un plan de pago activo (${C.bold}Friend${C.reset} o ${C.bold}Signet${C.reset}).`);
      console.log(`  Actualiza tu suscripción en: ${C.white}https://deiza.org/plans${C.reset}\n`);
      process.exit(1);
    }
    console.log(`  ${C.white}Cuenta:${C.reset} ${C.bold}${cfg.email || 'Conectada'}${C.reset} · ${C.granateBold}[${plan.toUpperCase()}]${C.reset} · ${C.gray}Uso:${C.reset} ${pct}%${resetLabel ? ` (${resetLabel} restantes)` : ''}`);
  }

  const modelLabel = (!cfg.isCustomEndpoint && (activeModel.includes('omniscient') || activeModel.includes('liquid')))
    ? `${C.granateBright}Deiza Omniscient${C.reset} ${C.gray}[Liquid 5.1 · Amazon AWS Cluster] (BETA)${C.reset}`
    : `${C.granateBright}${activeModel}${C.reset}`;

  console.log(`  ${C.white}Modelo activo:${C.reset} ${modelLabel}`);
  console.log(`  ${C.white}Workspace:${C.reset} ${C.gray}${process.cwd()}${C.reset} [${projType}]${branchLabel}\n`);

  console.log(`  ${C.gray}Escribe tu consulta o usa ${C.white}/help${C.gray} para ver los comandos disponibles.${C.reset}\n`);

  const messages = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.granateBold}deiza-code ❯ ${C.reset}`,
  });

  // Safe confirmation prompt helper
  const confirmAction = (promptText) => {
    return new Promise((resolve) => {
      rl.question(`  ${C.gold}⚠️  ${promptText}${C.reset}`, (answer) => {
        const a = answer.trim().toLowerCase();
        resolve(a === 'y' || a === 's' || a === 'yes' || a === 'si');
      });
    });
  };

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Slash Commands Handling
    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '/help') {
        console.log(`\n${C.granateBold}Comandos disponibles en Deiza Code:${C.reset}`);
        console.log(`  ${C.bold}/model [id]${C.reset}     - Cambiar o listar modelos disponibles`);
        console.log(`  ${C.bold}/usage${C.reset}          - Consultar uso de plan y ventana de 5 horas`);
        console.log(`  ${C.bold}/endpoint [url]${C.reset} - Configurar endpoint custom (Ollama, vLLM, OpenAI)`);
        console.log(`  ${C.bold}/init${C.reset}           - Inicializar archivo de reglas .deizarules en el repo`);
        console.log(`  ${C.bold}/clear${C.reset}          - Limpiar historial de la sesión actual`);
        console.log(`  ${C.bold}/login${C.reset}          - Conectar o cambiar cuenta de Deiza`);
        console.log(`  ${C.bold}/logout${C.reset}         - Cerrar sesión en esta máquina`);
        console.log(`  ${C.bold}/exit${C.reset}           - Salir de Deiza Code\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/model') {
        if (!cfg.isCustomEndpoint) {
          console.log(`\n${C.granateBold}Motor Dedicado en Deiza Code:${C.reset}`);
          console.log(`  ${C.green}●${C.reset} ${C.bold}Deiza Omniscient${C.reset} (Liquid 5.1 · BETA)`);
          console.log(`    ${C.gray}Infraestructura:${C.reset} Amazon AWS Dedicated High-Compute Clusters`);
          console.log(`    ${C.gray}Especialidad:${C.reset} Diffs quirúrgicos en línea, tests y ejecución autónoma`);
          console.log(`    ${C.gray}Estado:${C.reset} Motor exclusivo asignado durante la fase Beta.\n`);
        } else {
          const targetModel = parts[1];
          if (targetModel) {
            activeModel = targetModel;
            cfg.model = activeModel;
            saveConfig(cfg);
            console.log(`  ${C.green}✓ Modelo cambiado a ${C.bold}${activeModel}${C.reset}\n`);
          } else {
            console.log(`\n  ${C.gray}Usa: /model <id> para cambiar el modelo en tu endpoint custom.${C.reset}\n`);
          }
        }
        rl.prompt();
        return;
      }

      if (cmd === '/endpoint') {
        const targetEndpoint = parts[1];
        if (targetEndpoint) {
          cfg.apiBase = targetEndpoint.replace(/\/+$/, '');
          cfg.isCustomEndpoint = !cfg.apiBase.includes('deiza.org');
          saveConfig(cfg);
          console.log(`  ${C.green}✓ Endpoint actualizado a:${C.reset} ${cfg.apiBase}\n`);
        } else {
          console.log(`\n${C.granateBold}Configuración de Endpoint:${C.reset}`);
          console.log(`  Endpoint actual: ${C.white}${cfg.apiBase}${C.reset}`);
          console.log(`  Nativo Deiza:    https://deiza.org`);
          console.log(`  Ollama Local:    http://127.0.0.1:11434`);
          console.log(`  vLLM / LMStudio: http://127.0.0.1:8000\n`);
          console.log(`  ${C.gray}Usa: /endpoint <url> para cambiarlo.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/usage') {
        const currentUsage = await fetchUsage(cfg.apiKey, cfg.apiBase);
        if (!currentUsage) {
          console.log(`  ${C.gray}Endpoint personalizado o información de uso no disponible.${C.reset}\n`);
        } else {
          const usedPct = currentUsage.token_limit > 0
            ? Math.round((currentUsage.tokens_used / currentUsage.token_limit) * 100)
            : 0;
          const mins = currentUsage.reset_in_seconds ? Math.ceil(currentUsage.reset_in_seconds / 60) : 0;
          console.log(`\n${C.granateBold}Estado de Uso de tu Plan:${C.reset}`);
          console.log(`  Plan:              ${C.bold}${currentUsage.plan.toUpperCase()}${C.reset}`);
          console.log(`  Tokens utilizados: ${currentUsage.tokens_used.toLocaleString()} / ${currentUsage.token_limit.toLocaleString()} (${usedPct}%)`);
          console.log(`  Ventana de uso:    ${mins > 0 ? `Se reinicia en ${Math.floor(mins / 60)}h ${mins % 60}m` : '0% (se iniciará al enviar un mensaje)'}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/init') {
        const rulesPath = path.join(process.cwd(), '.deizarules');
        if (!fs.existsSync(rulesPath)) {
          const template = `# Directivas de Proyecto para Deiza Code\n\n- Mantener estilo limpio y modular.\n- Escribir tests para nuevas funciones.\n- Preferir TypeScript y tipado estricto.\n`;
          fs.writeFileSync(rulesPath, template, 'utf-8');
          console.log(`  ${C.green}✓ Creado archivo .deizarules en ${rulesPath}${C.reset}\n`);
        } else {
          console.log(`  ${C.gold}ℹ El archivo .deizarules ya existe en este proyecto.${C.reset}\n`);
        }
        rl.prompt();
        return;
      }

      if (cmd === '/clear') {
        messages.length = 0;
        console.clear();
        console.log(`  ${C.green}✓ Contexto de conversación limpiado.${C.reset}\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/login') {
        try {
          cfg = await runLoginFlow(cfg);
        } catch (err) {
          console.log(Status.error(err.message));
        }
        rl.prompt();
        return;
      }

      if (cmd === '/logout') {
        cfg.apiKey = '';
        cfg.email = '';
        saveConfig(cfg);
        console.log(`  ${C.green}✓ Sesión cerrada con éxito.${C.reset}\n`);
        rl.prompt();
        return;
      }

      if (cmd === '/exit' || cmd === '/quit') {
        rl.close();
        return;
      }

      console.log(`  ${C.granateBright}Comando desconocido:${C.reset} ${cmd}. Escribe /help para ver la lista.\n`);
      rl.prompt();
      return;
    }

    // Process user coding instruction
    rl.pause();
    try {
      await runAgentTurn({
        cfg,
        messages,
        userInput: input,
        rl,
        confirmCallback: confirmAction,
      });
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') {
        console.log(Status.error('Tu sesión ha expirado o la clave es inválida. Ejecuta /login para reconectar.'));
      } else if (err.message === 'USAGE_LIMIT_EXCEEDED') {
        console.log(Status.error('Has alcanzado el límite de uso de tu plan. Consulta /usage para ver cuándo se reinicia.'));
      } else {
        console.log(Status.error(err.message));
      }
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${C.gray}Sesión finalizada.${C.reset}\n`);
    process.exit(0);
  });
}

module.exports = {
  startRepl,
};

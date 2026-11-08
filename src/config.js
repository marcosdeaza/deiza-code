/**
 * DEIZA CODE — Configuration & Settings
 * Storage in ~/.deiza/config.json plus DEIZA_* environment overrides.
 *
 * Native models (context window in tokens). The generic ids follow the current generation:
 *   - deiza-liquid:   Liquid 6 from 13-nov-2026 (256K), Liquid 5.5 before (1M). Balanced and agentic.
 *   - deiza-solid:    Solid 5.5  (the most capable: methodical, coding and research, reads images, 1M)
 *   - deiza-gas:      GAS 5.5    (fastest and lightest, vision, 200K)
 * Pinned previous generations: deiza-liquid-5.5, deiza-solid-5, deiza-gas-4.5.
 * Vainilla was retired in 2.2.0; saved configs that still name it open Gas.
 *
 * Two different URLs live in the config:
 *   - accountBase: the Deiza account server (login, plan, usage). Always deiza.org.
 *   - apiBase:     the inference endpoint. deiza.org by default; can point to any
 *                  OpenAI-compatible server (Ollama, vLLM, LM Studio...) after login.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEIZA_DIR = path.join(os.homedir(), '.deiza');
const CONFIG_FILE = path.join(DEIZA_DIR, 'config.json');
const SESSIONS_DIR = path.join(DEIZA_DIR, 'sessions');

const VERSION = '2.5.10';
const DEFAULT_DEIZA_API = 'https://deiza.org';
const DEFAULT_MODEL = 'deiza-solid';   // 1M of context: the default for coding since 2.4.0

const LIQUID55_AT = '2026-10-12T00:00:00+02:00';
const liquid55Live = (now = Date.now()) => now >= Date.parse(LIQUID55_AT);
const GAS55_AT = '2026-10-18T17:00:00+02:00';
const gas55Live = (now = Date.now()) => now >= Date.parse(GAS55_AT);
const SOLID55_AT = '2026-11-07T00:00:00+01:00';
const solid55Live = (now = Date.now()) => now >= Date.parse(SOLID55_AT);
// Liquid 6: midnight from Thursday 12 to Friday 13 November 2026 in Madrid, the same instant everywhere.
const LIQUID6_AT = '2026-11-13T00:00:00+01:00';
const liquid6Live = (now = Date.now()) => now >= Date.parse(LIQUID6_AT);
const LIQUID6_SOON = 'Liquid 6 llega el viernes 13 de noviembre a las 00:00 (hora peninsular).';
const EFFORTS = ['low', 'medium', 'high', 'ultra', 'max'];
const isGas55Model = (model, now = Date.now()) => gas55Live(now) && ['deiza-gas', 'deiza-gas-5.5'].includes(model);
const modelSupportsEffort = (model) => isGas55Model(model) || !String(model || '').includes('gas');
const effortForModel = (cfg, model = cfg.model) => {
  const value = isGas55Model(model) ? (cfg.gasEffort || 'low') : cfg.effort;
  return modelSupportsEffort(model) && EFFORTS.includes(value) ? value : undefined;
};
const NATIVE_MODELS = ['deiza-gas-4.5', 'deiza-gas-5.5', 'deiza-liquid', 'deiza-solid', 'deiza-gas', 'deiza-liquid-5.1', 'deiza-liquid-5.5', 'deiza-liquid-6', 'deiza-solid-5', 'deiza-solid-5.5'];

const MODEL_ALIASES = {
  'liquid': 'deiza-liquid',
  'liquid-5': 'deiza-liquid',
  'liquid5': 'deiza-liquid',
  'liquid-5.1': 'deiza-liquid-5.1',
  'liquid-5.5': 'deiza-liquid-5.5',
  'liquid-6': 'deiza-liquid-6',
  'liquid6': 'deiza-liquid-6',
  'deiza-liquid-5': 'deiza-liquid',
  '5': 'deiza-liquid',
  '1': 'deiza-liquid',

  'solid': 'deiza-solid',
  // 2.5.10: Solid 5.5 is the generic Solid; "solid-5" now pins the previous generation
  'solid-5.5': 'deiza-solid-5.5',
  'solid55': 'deiza-solid-5.5',
  'solid-5': 'deiza-solid-5',
  'solid5': 'deiza-solid-5',
  'solid-4.6': 'deiza-solid',
  'solid-4.5': 'deiza-solid',
  'solid45': 'deiza-solid',
  '4.5': 'deiza-solid',
  '2': 'deiza-solid',

  'gas': 'deiza-gas',
  'gas-5.5': 'deiza-gas-5.5',
  'gas-4.5': 'deiza-gas-4.5',
  'gas-4.1': 'deiza-gas',
  'gas41': 'deiza-gas',
  '4.1': 'deiza-gas',
  '3': 'deiza-gas',

  // Vainilla was retired: its names now open Gas
  'vainilla': 'deiza-gas',
  'vanilla': 'deiza-gas',
  'deiza-vainilla': 'deiza-gas',
  '4': 'deiza-gas',

  'omniscient': 'deiza-liquid',
  'deiza-omniscient': 'deiza-liquid',
  'default': 'deiza-liquid',
};

const MODEL_INFO = {
  'deiza-liquid': {
    id: 'deiza-liquid',
    shortName: 'liquid',
    get name() { return 'Deiza Liquid ' + (liquid6Live() ? '6' : liquid55Live() ? '5.5' : '5.1'); },
    get badge() { return liquid6Live() ? 'Liquid 6 · 256K tokens' : liquid55Live() ? 'Liquid 5.5 · 1M tokens' : 'Liquid 5.1 · 256K tokens'; },
    get tag() { return liquid6Live() ? 'LIQUID 6' : liquid55Live() ? 'LIQUID 5.5' : 'LIQUID 5.1'; },
    get desc() { return liquid6Live() ? 'El nuevo Liquid: equilibrado y agéntico, primeras respuestas rápidas, visión y 256K tokens.' : liquid55Live() ? 'Equilibrado y agéntico. Ventana de 1M tokens, razonamiento adaptativo y visión.' : 'Motor principal autónomo. Ventana de 256K tokens, alta velocidad y diffs limpios.'; },
    tier: 'Equilibrado',
    speed: 'Rápido',
    default: false,
  },
  'deiza-solid': {
    id: 'deiza-solid',
    shortName: 'solid',
    get name() { return solid55Live() ? 'Deiza Solid 5.5' : 'Deiza Solid 5'; },
    get badge() { return (solid55Live() ? 'Solid 5.5' : 'Solid 5') + ' · 1M de contexto'; },
    get tag() { return solid55Live() ? 'SOLID 5.5' : 'SOLID 5'; },
    desc: 'El más capaz y metódico. Planifica antes de tocar el código y verifica cada paso: arquitectura, refactorizaciones grandes, depuración difícil e investigación.',
    tier: 'Razonamiento',
    speed: 'Analítico',
    default: true,
  },
  'deiza-gas': {
    id: 'deiza-gas',
    shortName: 'gas',
    get name() { return gas55Live() ? 'Deiza GAS 5.5' : 'Deiza Gas 4.5'; },
    get badge() { return gas55Live() ? 'GAS 5.5 · 200K · Visión' : 'Gas 4.5 · Ultra-rápido'; },
    get tag() { return gas55Live() ? 'GAS 5.5' : 'GAS 4.5'; },
    desc: 'El más rápido y ligero. Para cambios pequeños, scripts e iteraciones ágiles.',
    tier: 'Velocidad',
    speed: 'Ultra-rápido',
    default: false,
  },

};

for (const version of ['5.1', '5.5']) {
  MODEL_INFO['deiza-liquid-' + version] = { ...MODEL_INFO['deiza-liquid'], id: 'deiza-liquid-' + version, shortName: 'liquid-' + version, name: 'Deiza Liquid ' + version, badge: 'Liquid ' + version + ' · ' + (version === '5.5' ? '1M' : '256K') + ' tokens', tag: 'LIQUID ' + version, desc: version === '5.5' ? 'Liquid 5.5, disponible desde el 12 de octubre: 1M de contexto, razonamiento adaptativo y visión.' : 'Generación anterior. Contexto de 256K tokens y visión.' };
}
// Once Liquid 6 is out, Liquid 5.5 is the pinned previous generation (256K) and Liquid 5.1 is retired onto it.
Object.defineProperties(MODEL_INFO['deiza-liquid-5.5'], {
  badge: { get() { return 'Liquid 5.5 · ' + (liquid6Live() ? '256K' : '1M') + ' tokens'; }, enumerable: true },
  desc: { get() { return liquid6Live() ? 'Generación anterior, versión fija. Contexto de 256K tokens y visión.' : 'Liquid 5.5: 1M de contexto, razonamiento adaptativo y visión.'; }, enumerable: true },
});
MODEL_INFO['deiza-liquid-6'] = { ...MODEL_INFO['deiza-liquid'], id: 'deiza-liquid-6', shortName: 'liquid-6', name: 'Deiza Liquid 6', badge: 'Liquid 6 · 256K tokens', tag: 'LIQUID 6', get desc() { return liquid6Live() ? 'Liquid 6, versión fija.' : LIQUID6_SOON; } };
MODEL_INFO['deiza-solid-5.5'] = { ...MODEL_INFO['deiza-solid'], id: 'deiza-solid-5.5', shortName: 'solid-5.5', name: 'Deiza Solid 5.5', badge: 'Solid 5.5 · 1M de contexto', tag: 'SOLID 5.5', default: false };
MODEL_INFO['deiza-solid-5'] = { ...MODEL_INFO['deiza-solid'], id: 'deiza-solid-5', shortName: 'solid-5', name: 'Deiza Solid 5', badge: 'Solid 5 · 256K de contexto', tag: 'SOLID 5', desc: 'Generación anterior, versión fija. Contexto de 256K tokens y visión.', default: false };

MODEL_INFO['deiza-gas-5.5'] = { id: 'deiza-gas-5.5', name: 'Deiza GAS 5.5', tag: 'GAS 5.5', desc: 'Disponible desde el 18 de octubre a las 17:00, hora peninsular.', shortName: 'gas-5.5' };
MODEL_INFO['deiza-gas-4.5'] = { id: 'deiza-gas-4.5', name: 'Deiza Gas 4.5', tag: 'GAS 4.5', get desc() { return gas55Live() ? 'Obsoleto. Generación anterior; usa GAS 5.5 para tareas nuevas.' : 'Gas 4.5, versión fija.'; }, shortName: 'gas-4.5' };

// Real context windows (tokens) of the native engines. Compaction starts at 70 % of the window of
// the model in use; custom endpoints get a conservative 128K.
const CONTEXT_LIMITS = {
  get 'deiza-liquid'() { return liquid6Live() ? 256000 : liquid55Live() ? 1048576 : 262144; },
  'deiza-liquid-5.1': 262144,
  get 'deiza-liquid-5.5'() { return liquid6Live() ? 262144 : 1048576; },
  'deiza-liquid-6': 256000,
  'deiza-solid': 1048576,
  'deiza-solid-5.5': 1048576,
  get 'deiza-solid-5'() { return solid55Live() ? 262144 : 1048576; },
  get 'deiza-gas'() { return gas55Live() ? 200000 : 131072; },
  'deiza-gas-4.5': 131072, 'deiza-gas-5.5': 200000,
};
function contextLimit(model) {
  return CONTEXT_LIMITS[model] || (model && String(model).startsWith('deiza') ? 262144 : 131072);
}

// Build flavor. 'open' = the GitHub edition (any OpenAI-compatible engine can be plugged in);
// 'closed' = the deiza.org installer edition (Deiza native models only, no endpoint options).
// The bundler injects DEIZA_FLAVOR; running from the source tree defaults to open.
const FLAVOR = (typeof DEIZA_FLAVOR !== 'undefined' && DEIZA_FLAVOR) || process.env.DEIZA_FLAVOR || 'open';
const IS_CLOSED = FLAVOR === 'closed';
const MODES = ['build', 'copilot', 'plan'];
const DEFAULT_MODE = 'build';

function ensureDirs() {
  if (!fs.existsSync(DEIZA_DIR)) fs.mkdirSync(DEIZA_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isDeizaHost(url) {
  try {
    const host = new URL(normalizeUrl(url)).hostname.toLowerCase();
    return host === 'deiza.org' || host.endsWith('.deiza.org');
  } catch {
    return false;
  }
}

function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  return MODES.includes(m) ? m : DEFAULT_MODE;
}

function normalizeModel(modelStr, isCustom = false) {
  const s = String(modelStr || '').trim();
  if (isCustom) return s || 'default';
  const lower = s.toLowerCase();
  if (MODEL_ALIASES[lower] === 'deiza-gas-5.5' && !gas55Live()) throw new Error('GAS 5.5 estará disponible el 18 de octubre a las 17:00, hora peninsular.');
  if (MODEL_ALIASES[lower] && !['deiza-liquid-6', 'deiza-liquid-5.1'].includes(MODEL_ALIASES[lower])) return MODEL_ALIASES[lower];
  if ((lower === 'deiza-gas-5.5' || MODEL_ALIASES[lower] === 'deiza-gas-5.5') && !gas55Live()) throw new Error('GAS 5.5 estará disponible el 18 de octubre a las 17:00, hora peninsular.');
  const id = MODEL_ALIASES[lower] || lower;
  if (id === 'deiza-liquid-6' && !liquid6Live()) throw new Error(LIQUID6_SOON);
  if (id === 'deiza-liquid-5.1' && liquid6Live()) return 'deiza-liquid-5.5';   // Liquid 5.1 retired with Liquid 6
  if (NATIVE_MODELS.includes(id)) return id;
  return DEFAULT_MODEL;
}

function loadConfig() {
  ensureDirs();
  let fileConfig = {};
  let needsResave = false;
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      fileConfig = {};
    }
  }

  const accountBase = normalizeUrl(process.env.DEIZA_API_URL || DEFAULT_DEIZA_API);
  const savedEndpoint = IS_CLOSED ? '' : normalizeUrl(fileConfig.endpoint || '');
  const endpoint = IS_CLOSED ? '' : normalizeUrl(process.env.DEIZA_ENDPOINT || savedEndpoint);
  const apiBase = endpoint && !isDeizaHost(endpoint) ? endpoint : accountBase;
  const apiKey = String(process.env.DEIZA_API_KEY || fileConfig.apiKey || '').trim();
  const isCustom = apiBase !== accountBase;

  let rawModel = isCustom
    ? String(process.env.DEIZA_MODEL || fileConfig.endpointModel || fileConfig.model || 'default').trim()
    : String(process.env.DEIZA_MODEL || fileConfig.model || DEFAULT_MODEL).trim();

  let model;
  try { model = normalizeModel(rawModel, isCustom); } catch { model = DEFAULT_MODEL; }   // e.g. DEIZA_MODEL=liquid-6 before the launch
  if (!isCustom && fileConfig.model && fileConfig.model !== model) {
    fileConfig.model = model;
    needsResave = true;
  }

  const result = {
    ...fileConfig,
    accountBase,
    apiBase,
    endpoint: apiBase === accountBase ? '' : apiBase,
    apiKey,
    model,
    email: fileConfig.email || '',
    name: fileConfig.name || '',
    plan: fileConfig.plan || '',
    endpointKey: String(process.env.DEIZA_ENDPOINT_KEY || fileConfig.endpointKey || '').trim(),
    endpointModel: fileConfig.endpointModel || '',
    defaultMode: normalizeMode(fileConfig.defaultMode),
    isCustomEndpoint: isCustom,
  };

  if (needsResave) {
    try { saveConfig(result); } catch {}
  }

  return result;
}

function saveConfig(cfg) {
  ensureDirs();
  // Never persist derived fields; the file stays small and forward compatible.
  const { accountBase, isCustomEndpoint, apiBase, mode, usage, ...rest } = cfg || {};
  const toSave = { ...rest, endpoint: cfg.endpoint || '' };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
}

module.exports = {
  GAS55_AT, gas55Live, isGas55Model, modelSupportsEffort, EFFORTS, effortForModel,
  SOLID55_AT, solid55Live, LIQUID6_AT, liquid6Live, LIQUID6_SOON,
  LIQUID55_AT,
  liquid55Live,
  CONTEXT_LIMITS,
  contextLimit,
  VERSION,
  FLAVOR,
  IS_CLOSED,
  DEIZA_DIR,
  CONFIG_FILE,
  SESSIONS_DIR,
  DEFAULT_DEIZA_API,
  DEFAULT_MODEL,
  NATIVE_MODELS,
  MODEL_ALIASES,
  MODEL_INFO,
  MODES,
  DEFAULT_MODE,
  loadConfig,
  saveConfig,
  isDeizaHost,
  normalizeMode,
  normalizeModel,
  normalizeUrl,
};

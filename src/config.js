/**
 * DEIZA CODE — Configuration & Settings
 * Storage in ~/.deiza/config.json plus DEIZA_* environment overrides.
 *
 * Two different URLs live in the config:
 *   - accountBase: the Deiza account server (login, plan, usage). Always deiza.org.
 *   - apiBase:     the inference endpoint. deiza.org by default; can point to any
 *                  OpenAI-compatible server (Ollama, vLLM, LM Studio...) after login.
 *
 * Generic variables such as OPENAI_BASE_URL / OPENAI_API_KEY are deliberately ignored:
 * they belong to other tools on the machine and used to hijack the Deiza login.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEIZA_DIR = path.join(os.homedir(), '.deiza');
const CONFIG_FILE = path.join(DEIZA_DIR, 'config.json');
const SESSIONS_DIR = path.join(DEIZA_DIR, 'sessions');

const VERSION = '1.7.0';
const DEFAULT_DEIZA_API = 'https://deiza.org';
const DEFAULT_MODEL = 'deiza-omniscient';

// Build flavor. 'open' = the GitHub edition (any OpenAI-compatible engine can be plugged in);
// 'closed' = the deiza.org installer edition (Deiza Omniscient only, no endpoint options).
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

function loadConfig() {
  ensureDirs();
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {
      fileConfig = {};
    }
  }

  // v1.2 saved whatever `apiBase` the OPENAI_BASE_URL hijack produced (a third-party URL), so a
  // legacy `apiBase` is ignored: only an endpoint chosen explicitly with --endpoint / /endpoint
  // (stored as `endpoint`) or DEIZA_ENDPOINT counts as a custom inference endpoint.
  const accountBase = normalizeUrl(process.env.DEIZA_API_URL || DEFAULT_DEIZA_API);
  const savedEndpoint = IS_CLOSED ? '' : normalizeUrl(fileConfig.endpoint || '');
  const endpoint = IS_CLOSED ? '' : normalizeUrl(process.env.DEIZA_ENDPOINT || savedEndpoint);
  const apiBase = endpoint && !isDeizaHost(endpoint) ? endpoint : accountBase;
  const apiKey = String(process.env.DEIZA_API_KEY || fileConfig.apiKey || '').trim();
  const isCustom = apiBase !== accountBase;
  // The native engine has exactly one model; a stale "default"/"gpt-4o" from an old config is dropped.
  const model = isCustom
    ? String(process.env.DEIZA_MODEL || fileConfig.endpointModel || fileConfig.model || 'default').trim()
    : DEFAULT_MODEL;

  return {
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
}

function saveConfig(cfg) {
  ensureDirs();
  // Never persist derived fields; the file stays small and forward compatible.
  const { accountBase, isCustomEndpoint, apiBase, mode, usage, ...rest } = cfg || {};
  const toSave = { ...rest, endpoint: cfg.endpoint || '' };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
}

module.exports = {
  VERSION,
  FLAVOR,
  IS_CLOSED,
  DEIZA_DIR,
  CONFIG_FILE,
  SESSIONS_DIR,
  DEFAULT_DEIZA_API,
  DEFAULT_MODEL,
  MODES,
  DEFAULT_MODE,
  loadConfig,
  saveConfig,
  isDeizaHost,
  normalizeMode,
  normalizeUrl,
};

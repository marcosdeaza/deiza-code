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

const VERSION = '1.3.0';
const DEFAULT_DEIZA_API = 'https://deiza.org';
const DEFAULT_MODEL = 'deiza-omniscient';
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

  // Older versions stored the inference endpoint in `apiBase` and used it for login too.
  // A saved non-Deiza apiBase is now treated as a custom inference endpoint only.
  const accountBase = normalizeUrl(process.env.DEIZA_API_URL || DEFAULT_DEIZA_API);
  const savedEndpoint = normalizeUrl(fileConfig.endpoint || fileConfig.apiBase || '');
  const endpoint = normalizeUrl(process.env.DEIZA_ENDPOINT || savedEndpoint);
  const apiBase = endpoint && !isDeizaHost(endpoint) ? endpoint : accountBase;
  const apiKey = String(process.env.DEIZA_API_KEY || fileConfig.apiKey || '').trim();
  const model = String(process.env.DEIZA_MODEL || fileConfig.model || DEFAULT_MODEL).trim();

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
    isCustomEndpoint: apiBase !== accountBase,
  };
}

function saveConfig(cfg) {
  ensureDirs();
  // Never persist derived fields; the file stays small and forward compatible.
  const { accountBase, isCustomEndpoint, apiBase, mode, ...rest } = cfg || {};
  const toSave = { ...rest, endpoint: cfg.endpoint || '' };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf-8');
}

module.exports = {
  VERSION,
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

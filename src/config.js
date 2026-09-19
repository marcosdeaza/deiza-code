/**
 * DEIZA CODE — Configuration & Settings
 * Handles storage in ~/.deiza/config.json and universal environment variable overrides.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEIZA_DIR = path.join(os.homedir(), '.deiza');
const CONFIG_FILE = path.join(DEIZA_DIR, 'config.json');
const SESSIONS_DIR = path.join(DEIZA_DIR, 'sessions');

const DEFAULT_DEIZA_API = 'https://deiza.org';
const DEFAULT_MODEL = 'deiza-omniscient';

function ensureDirs() {
  if (!fs.existsSync(DEIZA_DIR)) fs.mkdirSync(DEIZA_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
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

  // Universal AI Environment Variable Support
  // Allows recycling Deiza Code with ANY OpenAI-compatible endpoint, Ollama, LM Studio, etc.
  const apiBase = process.env.DEIZA_API_URL || process.env.OPENAI_BASE_URL || fileConfig.apiBase || DEFAULT_DEIZA_API;
  const apiKey = process.env.DEIZA_API_KEY || process.env.OPENAI_API_KEY || fileConfig.apiKey || '';
  const model = process.env.DEIZA_MODEL || process.env.MODEL || fileConfig.model || DEFAULT_MODEL;

  return {
    ...fileConfig,
    apiBase: apiBase.replace(/\/+$/, ''),
    apiKey,
    model,
    email: fileConfig.email || '',
    plan: fileConfig.plan || 'pro',
    isCustomEndpoint: !apiBase.includes('deiza.org'),
  };
}

function saveConfig(cfg) {
  ensureDirs();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

module.exports = {
  DEIZA_DIR,
  CONFIG_FILE,
  SESSIONS_DIR,
  DEFAULT_DEIZA_API,
  DEFAULT_MODEL,
  loadConfig,
  saveConfig,
};

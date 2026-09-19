const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SESSIONS_ROOT = path.join(os.homedir(), '.deiza', 'sessions');

/**
 * Generates a stable directory name for a workspace path
 */
function getWorkspaceHash(cwd = process.cwd()) {
  const norm = path.resolve(cwd);
  return crypto.createHash('md5').update(norm).digest('hex').slice(0, 12);
}

/**
 * Returns the directory where sessions for the current workspace are stored
 */
function getWorkspaceSessionsDir(cwd = process.cwd()) {
  const hash = getWorkspaceHash(cwd);
  const dir = path.join(SESSIONS_ROOT, hash);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generates a unique session ID
 */
function generateSessionId() {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  return `ses_${dateStr}_${rand}`;
}

/**
 * Quick token estimator for fallback when backend doesn't send usage header
 */
function estimateTokens(text) {
  if (!text) return 0;
  if (typeof text !== 'string') text = JSON.stringify(text);
  return Math.max(1, Math.ceil(text.length / 3.8));
}

/**
 * Creates a new session object
 */
function createSession(cwd = process.cwd(), mode = 'build', customTitle = null) {
  const id = generateSessionId();
  const session = {
    id,
    title: customTitle || 'Nueva conversación',
    cwd: path.resolve(cwd),
    mode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tokens: {
      prompt: 0,
      completion: 0,
      total: 0,
    },
    messages: [],
  };
  saveSession(session);
  return session;
}

/**
 * Saves a session to disk
 */
function saveSession(session) {
  try {
    if (!session || !session.id) return;
    const dir = getWorkspaceSessionsDir(session.cwd || process.cwd());
    const filePath = path.join(dir, `${session.id}.json`);
    session.updatedAt = new Date().toISOString();
    if (!session.tokens) {
      session.tokens = { prompt: 0, completion: 0, total: 0 };
    }
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
  } catch (err) {
    // Fail silently without crashing CLI
  }
}

/**
 * Resolves full or partial session ID
 */
function findSessionId(query, cwd = process.cwd()) {
  if (!query) return null;
  const clean = query.trim();
  const dir = getWorkspaceSessionsDir(cwd);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  // 1. Exact match
  if (files.includes(`${clean}.json`)) return clean;

  // 2. Partial ID or title match
  const match = files.find(f => {
    const id = f.replace('.json', '');
    return id.includes(clean) || id.endsWith(clean);
  });
  return match ? match.replace('.json', '') : null;
}

/**
 * Loads a specific session by ID or partial query for a workspace
 */
function loadSession(sessionIdOrQuery, cwd = process.cwd()) {
  try {
    const resolvedId = findSessionId(sessionIdOrQuery, cwd) || sessionIdOrQuery;
    const dir = getWorkspaceSessionsDir(cwd);
    const filePath = path.join(dir, `${resolvedId}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!data.tokens) {
        data.tokens = { prompt: 0, completion: 0, total: 0 };
      }
      return data;
    }
  } catch (err) {}
  return null;
}

/**
 * Adds token consumption to a session
 */
function addSessionTokens(session, usage = {}) {
  if (!session) return;
  if (!session.tokens) {
    session.tokens = { prompt: 0, completion: 0, total: 0 };
  }
  const p = Number(usage.promptTokens || usage.prompt_tokens || 0);
  const c = Number(usage.completionTokens || usage.completion_tokens || 0);
  const t = Number(usage.totalTokens || usage.total_tokens || (p + c));

  session.tokens.prompt = (session.tokens.prompt || 0) + p;
  session.tokens.completion = (session.tokens.completion || 0) + c;
  session.tokens.total = (session.tokens.total || 0) + t;
  saveSession(session);
}

/**
 * Lists all sessions for the given workspace, sorted newest first
 */
function listSessions(cwd = process.cwd()) {
  try {
    const dir = getWorkspaceSessionsDir(cwd);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const sessions = [];

    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        sessions.push({
          id: data.id,
          title: data.title || 'Conversación',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          mode: data.mode || 'build',
          messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
          tokens: data.tokens || { prompt: 0, completion: 0, total: 0 },
        });
      } catch (e) {}
    }

    // Sort by updatedAt desc
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sessions;
  } catch (err) {
    return [];
  }
}

/**
 * Returns the most recent session for this workspace, if any
 */
function getLatestSession(cwd = process.cwd()) {
  const sessions = listSessions(cwd);
  if (sessions.length > 0) {
    return loadSession(sessions[0].id, cwd);
  }
  return null;
}

/**
 * Updates session title based on first user prompt if still default
 */
function updateSessionTitleFromPrompt(session, promptText) {
  if (!session || !promptText) return;
  if (session.title === 'Nueva conversación' || !session.title) {
    const cleaned = promptText.trim().replace(/[\r\n]+/g, ' ');
    session.title = cleaned.length > 45 ? cleaned.slice(0, 42) + '...' : cleaned;
    saveSession(session);
  }
}

/**
 * Deletes a session file
 */
function deleteSession(sessionIdOrQuery, cwd = process.cwd()) {
  try {
    const resolvedId = findSessionId(sessionIdOrQuery, cwd) || sessionIdOrQuery;
    const dir = getWorkspaceSessionsDir(cwd);
    const filePath = path.join(dir, `${resolvedId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true, id: resolvedId };
    }
  } catch (err) {}
  return { success: false, id: sessionIdOrQuery };
}

module.exports = {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  getLatestSession,
  updateSessionTitleFromPrompt,
  deleteSession,
  addSessionTokens,
  estimateTokens,
  findSessionId,
  getWorkspaceHash,
};

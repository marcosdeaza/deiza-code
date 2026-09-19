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
 * Creates a new session object
 */
function createSession(cwd = process.cwd(), mode = 'build') {
  const id = generateSessionId();
  const session = {
    id,
    title: 'Nueva conversación',
    cwd: path.resolve(cwd),
    mode,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
  } catch (err) {
    // Fail silently without crashing CLI
  }
}

/**
 * Loads a specific session by ID for a workspace
 */
function loadSession(sessionId, cwd = process.cwd()) {
  try {
    const dir = getWorkspaceSessionsDir(cwd);
    const filePath = path.join(dir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {}
  return null;
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
function deleteSession(sessionId, cwd = process.cwd()) {
  try {
    const dir = getWorkspaceSessionsDir(cwd);
    const filePath = path.join(dir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {}
  return false;
}

module.exports = {
  createSession,
  saveSession,
  loadSession,
  listSessions,
  getLatestSession,
  updateSessionTitleFromPrompt,
  deleteSession,
  getWorkspaceHash,
};

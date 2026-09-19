/**
 * DEIZA CODE — Local Execution Tools
 * Surgical file reading, writing, editing with visual diffs, shell execution, and searches.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { renderDiff, Status } = require('./ui');

// Commands that destroy data: COPILOT mode asks before running them, BUILD mode runs them
// (it is the autonomous mode) except the catastrophic ones below, which are never executed.
const RISKY_PATTERNS = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r)\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bdrop\s+(database|table)\b/i,
  /\btruncate\s+table\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:>\s*\//,
  /\b(rmdir|rd)\s+\/s\b/i,
  /\bdel\s+.*\/[sq]\b/i,
];

// Never run, in any mode: wiping the machine, the disk or the whole home directory.
const CATASTROPHIC_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*\s+(\/|\/\*|~|~\/|\$HOME|\/home|\/Users|\/etc|\/usr|\/var|\/boot)(\s|$)/i,
  /\brm\s+-[a-z]*r[a-z]*\s+--no-preserve-root/i,
  /\bmkfs(\.[a-z0-9]+)?\s+\/dev\//i,
  /\bdd\s+.*of=\/dev\/(sd|nvme|disk|hd|mmcblk)/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
  /\bformat\s+[a-z]:/i,
  /\b(rd|rmdir)\s+\/s\s+\/q\s+[a-z]:\\?(\s|$)/i,
  /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i,
];

function isCommandRisky(command) {
  return RISKY_PATTERNS.some(p => p.test(command || ''));
}

function isCommandCatastrophic(command) {
  return CATASTROPHIC_PATTERNS.some(p => p.test(command || ''));
}

/**
 * COPILOT previews: compute what a tool WOULD change without touching the disk.
 * Returns { ok, diff, error } so the user can approve the exact change.
 */
function previewChange(name, args = {}) {
  try {
    if (name === 'write_file') {
      const fullPath = path.resolve(process.cwd(), args.path || '');
      const existed = fs.existsSync(fullPath);
      const oldContent = existed ? fs.readFileSync(fullPath, 'utf-8') : '';
      const content = String(args.content ?? '');
      if (!existed) {
        const lines = content.split('\n');
        const shown = lines.slice(0, 40).map(l => `  \x1b[38;2;60;180;110m+ ${l}\x1b[0m`).join('\n');
        const more = lines.length > 40 ? `\n  \x1b[38;2;130;130;140m... (${lines.length - 40} líneas más)\x1b[0m` : '';
        return { ok: true, diff: `\n  \x1b[1mNuevo archivo:\x1b[0m ${args.path} (${lines.length} líneas)\n${shown}${more}\n` };
      }
      return { ok: true, diff: renderDiff(args.path, oldContent, content) };
    }
    if (name === 'edit_file') {
      const fullPath = path.resolve(process.cwd(), args.path || '');
      if (!fs.existsSync(fullPath)) return { ok: false, error: `File not found: ${args.path}` };
      const content = fs.readFileSync(fullPath, 'utf-8');
      const oldStr = String(args.old_string ?? '');
      if (!content.includes(oldStr)) return { ok: false, error: `Could not find exact text match in ${args.path}.` };
      if (content.split(oldStr).length - 1 > 1) return { ok: false, error: 'Target string is not unique.' };
      return { ok: true, diff: renderDiff(args.path, content, content.replace(oldStr, String(args.new_string ?? ''))) };
    }
    return { ok: true, diff: '' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

const Tools = {
  async read_file({ path: targetPath, start_line, end_line }) {
    try {
      const fullPath = path.resolve(process.cwd(), targetPath);
      if (!fs.existsSync(fullPath)) {
        return { error: `File not found: ${targetPath}` };
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return { error: `${targetPath} is a directory, not a file. Use list_dir instead.` };
      }
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const lines = raw.split('\n');
      const start = Math.max(1, start_line || 1);
      const end = Math.min(lines.length, end_line || lines.length);

      const sliced = lines.slice(start - 1, end).map((l, i) => `${start + i} | ${l}`).join('\n');
      return {
        path: targetPath,
        total_lines: lines.length,
        showing_range: [start, end],
        content: sliced,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async write_file({ path: targetPath, content }, ctx = {}) {
    try {
      const fullPath = path.resolve(process.cwd(), targetPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const existed = fs.existsSync(fullPath);
      const oldContent = existed ? fs.readFileSync(fullPath, 'utf-8') : '';

      fs.writeFileSync(fullPath, content, 'utf-8');

      if (existed && !ctx.quietDiff) {
        process.stdout.write(renderDiff(targetPath, oldContent, content));
      }

      return {
        path: targetPath,
        status: existed ? 'overwritten' : 'created',
        bytes_written: Buffer.byteLength(content, 'utf-8'),
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async edit_file({ path: targetPath, old_string, new_string }, ctx = {}) {
    try {
      const fullPath = path.resolve(process.cwd(), targetPath);
      if (!fs.existsSync(fullPath)) {
        return { error: `File not found: ${targetPath}` };
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(old_string)) {
        return {
          error: `Could not find exact text match in ${targetPath}. Please inspect the file with read_file first.`,
        };
      }

      const occurrences = content.split(old_string).length - 1;
      if (occurrences > 1) {
        return {
          error: `Found ${occurrences} occurrences of target string. Provide more surrounding context lines to make it unique.`,
        };
      }

      const newContent = content.replace(old_string, new_string);
      fs.writeFileSync(fullPath, newContent, 'utf-8');

      // Visual diff in terminal (COPILOT already showed it as a preview)
      if (!ctx.quietDiff) process.stdout.write(renderDiff(targetPath, content, newContent));

      return {
        path: targetPath,
        status: 'edited',
        occurrences_replaced: 1,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async list_dir({ path: targetPath = '.', max_depth = 1 }) {
    try {
      const fullPath = path.resolve(process.cwd(), targetPath);
      if (!fs.existsSync(fullPath)) return { error: `Directory not found: ${targetPath}` };

      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const items = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
        size_bytes: e.isDirectory() ? null : fs.statSync(path.join(fullPath, e.name)).size,
      }));

      return {
        directory: targetPath,
        total_items: items.length,
        items,
      };
    } catch (err) {
      return { error: err.message };
    }
  },

  async run_command({ command, cwd, timeout_ms = 120000 }) {
    if (isCommandCatastrophic(command)) {
      return { command, exit_code: 126, stdout: '', stderr: 'Comando bloqueado por Deiza Code: destruiría el sistema o el disco.', blocked: true };
    }
    return new Promise((resolve) => {
      const execCwd = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
      const limit = Math.min(Math.max(Number(timeout_ms) || 120000, 1000), 600000);
      exec(command, { cwd: execCwd, timeout: limit, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        resolve({
          command,
          exit_code: err ? (err.code || 1) : 0,
          stdout: (stdout || '').trim().slice(-30000),
          stderr: (stderr || '').trim().slice(-10000),
          killed_by_timeout: err?.killed || false,
        });
      });
    });
  },

  async search_files({ query, path: targetPath = '.', is_regex = false }) {
    try {
      const fullPath = path.resolve(process.cwd(), targetPath);
      const results = [];
      const regex = is_regex ? new RegExp(query, 'i') : null;
      const ignore = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '__pycache__', '.venv']);

      function searchDir(cur) {
        if (results.length >= 50) return;
        try {
          const list = fs.readdirSync(cur, { withFileTypes: true });
          for (const item of list) {
            if (ignore.has(item.name) || item.name.startsWith('.')) continue;
            const itemPath = path.join(cur, item.name);
            if (item.isDirectory()) {
              searchDir(itemPath);
            } else {
              try {
                const content = fs.readFileSync(itemPath, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  const match = regex ? regex.test(lines[i]) : lines[i].includes(query);
                  if (match) {
                    results.push({
                      file: path.relative(process.cwd(), itemPath),
                      line: i + 1,
                      content: lines[i].trim(),
                    });
                    if (results.length >= 50) break;
                  }
                }
              } catch {}
            }
          }
        } catch {}
      }

      searchDir(fullPath);
      return { query, matches_count: results.length, matches: results };
    } catch (err) {
      return { error: err.message };
    }
  },

  async invoke_subagent({ task, role = 'Research', context_paths = [] }, ctx = {}) {
    try {
      let extraContext = '';
      if (Array.isArray(context_paths)) {
        for (const p of context_paths.slice(0, 5)) {
          try {
            const full = path.resolve(process.cwd(), p);
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
              const snippet = fs.readFileSync(full, 'utf-8').slice(0, 4000);
              extraContext += `\n--- Archivo: ${p} ---\n${snippet}\n`;
            }
          } catch {}
        }
      }

      if (ctx.streamCompletion && ctx.cfg) {
        process.stdout.write(`\n  \x1b[38;2;225;112;128m🤖 [subagent:${role}]\x1b[0m Iniciando tarea delegada...\n`);

        const subMessages = [
          {
            role: 'system',
            content: `You are an autonomous subagent with role "${role}" in Deiza Code.
Your goal is to inspect the project context and complete the assigned task:
"${task}"
${extraContext ? `Provided context files:\n${extraContext}` : ''}
Provide a crisp, actionable, structured report with code snippets, root cause, or conclusions.`,
          },
          {
            role: 'user',
            content: `Execute the task: "${task}". Return a technical summary.`,
          },
        ];

        let streamedSubagent = '';
        await ctx.streamCompletion({
          apiBase: ctx.cfg.apiBase,
          apiKey: ctx.cfg.apiKey,
          model: ctx.cfg.model,
          messages: subMessages,
          onChunk: (chunk) => {
            streamedSubagent += chunk;
          },
        });

        process.stdout.write(`  \x1b[38;2;60;180;110m✓ [subagent:${role}]\x1b[0m Subagente completó la tarea.\n`);

        return {
          role,
          task,
          status: 'completed',
          report: streamedSubagent.trim(),
        };
      } else {
        return {
          role,
          task,
          status: 'completed',
          report: `Subagente (${role}) procesó la tarea "${task}".`,
        };
      }
    } catch (err) {
      return { error: `Error en subagente: ${err.message}` };
    }
  },

  async view_image({ path: imagePath }) {
    try {
      const fullPath = path.resolve(process.cwd(), imagePath);
      if (!fs.existsSync(fullPath)) {
        return { error: `Imagen no encontrada: ${imagePath}` };
      }
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return { error: `${imagePath} es un directorio, no una imagen.` };
      }

      const ext = path.extname(fullPath).toLowerCase().replace('.', '');
      const valid = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
      if (!valid.includes(ext)) {
        return { error: `Formato de imagen no soportado (.${ext}). Formatos: png, jpg, jpeg, webp, gif, svg` };
      }

      const mimeType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const buf = fs.readFileSync(fullPath);
      const b64 = buf.toString('base64');

      return {
        path: imagePath,
        mime_type: mimeType,
        size_bytes: stat.size,
        data_url: `data:${mimeType};base64,${b64}`,
        note: `Imagen cargada con éxito (${stat.size} bytes). Los datos visuales están disponibles para el modelo multimodal.`,
      };
    } catch (err) {
      return { error: err.message };
    }
  },
};

const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file with line numbers and optional line ranges.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute file path.' },
        start_line: { type: 'number', description: 'Optional 1-indexed starting line.' },
        end_line: { type: 'number', description: 'Optional 1-indexed ending line.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create a new file or overwrite an existing file with full content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write.' },
        content: { type: 'string', description: 'Complete content to write.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Perform a precise surgical edit by replacing a unique old_string with new_string.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit.' },
        old_string: { type: 'string', description: 'Exact string to be replaced.' },
        new_string: { type: 'string', description: 'Replacement string.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_dir',
    description: 'List contents of a directory (files and subdirectories with sizes).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list.' },
        max_depth: { type: 'number', description: 'Max depth to explore (default 1).' },
      },
    },
  },
  {
    name: 'run_command',
    description: 'Execute a terminal command safely in the project environment and capture output.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command line to execute.' },
        cwd: { type: 'string', description: 'Working directory.' },
        timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds (default 120000, max 600000).' },
      },
      required: ['command'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for text or regex pattern across workspace files.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'String or regex query.' },
        path: { type: 'string', description: 'Directory path to search within.' },
        is_regex: { type: 'boolean', description: 'Whether query is a regex.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'invoke_subagent',
    description: 'Delegate a specialized subtask (codebase exploration, deep testing, security audit) to an isolated subagent worker.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Clear instruction of the subtask to execute.' },
        role: { type: 'string', description: 'Subagent specialization, e.g. "Research", "Tester", "Auditor", "Refactor".' },
        context_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional file paths to supply as context to the subagent.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'view_image',
    description: 'Inspect a local image file (PNG, JPG, WEBP, GIF, SVG) using multimodal vision for UI analysis or mockups.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the image file.' },
      },
      required: ['path'],
    },
  },
];

module.exports = {
  Tools,
  TOOL_DEFINITIONS,
  isCommandRisky,
  isCommandCatastrophic,
  previewChange,
};

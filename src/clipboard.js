const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CACHE_DIR = path.join(os.homedir(), '.deiza', 'cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Supported image extensions
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'];

/**
 * Returns MIME type based on file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
    default:
      return 'image/png';
  }
}

/**
 * Converts a local image file to base64 data URL
 */
function imageFileToBase64(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const mime = getMimeType(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    return null;
  }
}

/**
 * Detects if user input contains an image file path (from drag-and-drop or pasting into CMD/terminal)
 * Returns { hasImage: boolean, imagePath: string|null, promptText: string, dataUrl: string|null }
 */
function detectImageInText(text) {
  if (!text || typeof text !== 'string') {
    return { hasImage: false, imagePath: null, promptText: text || '', dataUrl: null };
  }

  // 1. Check for quoted paths: "C:\path\to\img.png" or '/path/to/img.png'
  const quotedRegex = /["']([^"']+\.(?:png|jpe?g|webp|gif|bmp|svg))["']/i;
  const quotedMatch = text.match(quotedRegex);
  if (quotedMatch) {
    const candidatePath = quotedMatch[1].trim();
    if (fs.existsSync(candidatePath)) {
      const promptText = text.replace(quotedMatch[0], '').trim();
      const dataUrl = imageFileToBase64(candidatePath);
      return {
        hasImage: true,
        imagePath: path.resolve(candidatePath),
        promptText: promptText || 'Analiza esta imagen y relaciónala con el código del proyecto.',
        dataUrl,
      };
    }
  }

  // 2. Check for bare paths (Windows backslashes or Unix slashes or relative)
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/^["']|["']$/g, '');
    const ext = path.extname(word).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
      const candidatePath = path.isAbsolute(word) ? word : path.resolve(process.cwd(), word);
      if (fs.existsSync(candidatePath)) {
        const remainingWords = words.filter((_, idx) => idx !== i);
        const promptText = remainingWords.join(' ').trim();
        const dataUrl = imageFileToBase64(candidatePath);
        return {
          hasImage: true,
          imagePath: candidatePath,
          promptText: promptText || 'Analiza esta imagen y relaciónala con el código del proyecto.',
          dataUrl,
        };
      }
    }
  }

  return { hasImage: false, imagePath: null, promptText: text, dataUrl: null };
}

/**
 * Captures image from the operating system clipboard (e.g. after screenshot Win+Shift+S or Cmd+Shift+4)
 * Returns { success: boolean, imagePath: string|null, dataUrl: string|null, error: string|null }
 */
function getClipboardImage() {
  ensureCacheDir();
  const timestamp = Date.now();
  const targetFile = path.join(CACHE_DIR, `clipboard_${timestamp}.png`);
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // Windows: use PowerShell System.Windows.Forms.Clipboard
      const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $img = [System.Windows.Forms.Clipboard]::GetImage(); $img.Save('${targetFile.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'OK' } else { Write-Output 'EMPTY' }"`;
      const out = execSync(psCmd, { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
      if (out.includes('OK') && fs.existsSync(targetFile) && fs.statSync(targetFile).size > 0) {
        return {
          success: true,
          imagePath: targetFile,
          dataUrl: imageFileToBase64(targetFile),
          error: null,
        };
      }
      return { success: false, imagePath: null, dataUrl: null, error: 'No hay ninguna imagen o captura en el portapapeles de Windows.' };
    } else if (platform === 'darwin') {
      // macOS: use osascript to read PNG clipboard
      const script = `
        set theFile to (POSIX file "${targetFile}") as «class furl»
        try
          set pngData to the clipboard as «class PNGf»
          set f to open for access theFile with write permission
          set eof f to 0
          write pngData to f
          close access f
          return "OK"
        on error
          try
            close access file "${targetFile}"
          end try
          return "EMPTY"
        end try
      `;
      const out = execSync(`osascript -e '${script.replace(/\n/g, "' -e '")}'`, { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (out.includes('OK') && fs.existsSync(targetFile) && fs.statSync(targetFile).size > 0) {
        return {
          success: true,
          imagePath: targetFile,
          dataUrl: imageFileToBase64(targetFile),
          error: null,
        };
      }
      return { success: false, imagePath: null, dataUrl: null, error: 'No hay ninguna imagen en el portapapeles de macOS.' };
    } else {
      // Linux: check for xclip or wl-paste
      let ok = false;
      try {
        execSync(`xclip -selection clipboard -t image/png -o > "${targetFile}"`, { stdio: 'ignore', timeout: 3000 });
        ok = true;
      } catch (e1) {
        try {
          execSync(`wl-paste --type image/png > "${targetFile}"`, { stdio: 'ignore', timeout: 3000 });
          ok = true;
        } catch (e2) {}
      }

      if (ok && fs.existsSync(targetFile) && fs.statSync(targetFile).size > 0) {
        return {
          success: true,
          imagePath: targetFile,
          dataUrl: imageFileToBase64(targetFile),
          error: null,
        };
      }
      return { success: false, imagePath: null, dataUrl: null, error: 'No se detectó imagen en el portapapeles (instala xclip o wl-clipboard).' };
    }
  } catch (err) {
    return { success: false, imagePath: null, dataUrl: null, error: err.message };
  }
}

module.exports = {
  detectImageInText,
  getClipboardImage,
  imageFileToBase64,
  getMimeType,
  IMAGE_EXTENSIONS,
};

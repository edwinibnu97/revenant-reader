'use strict';

/**
 * Hook helper for .kiro/hooks/lint-on-save.json.
 * Kiro pipes the PostFileSave event context as JSON on STDIN. The payload
 * carries the saved file path (field name varies by surface/version), so we
 * probe the common candidates. If the file is a project JS file, run
 * `node --check` on it and exit with that command's status.
 *
 * Usage (from the project root, as the hook does):
 *   node .kiro/hooks/scripts/lint-saved.js < event.json
 */

const { execFile } = require('child_process');
const path = require('path');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // No stdin (manual run): treat as no-op success.
    setTimeout(() => resolve(data), 2000);
  });
}

function pickFilePath(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    obj.filePath,
    obj.file,
    obj.path,
    obj.filepath,
    obj.uri && String(obj.uri).replace(/^file:\/\//, ''),
    obj.params && obj.params.filePath,
    obj.event && obj.event.filePath,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.endsWith('.js')) return c;
  }
  return null;
}

async function main() {
  const raw = await readStdin();
  let file = null;
  try {
    file = pickFilePath(JSON.parse(raw));
  } catch {
    file = null;
  }
  if (!file) {
    console.log('lint-saved: no JS file path in hook event; skipping.');
    process.exit(0);
  }
  const abs = path.resolve(file);
  const root = path.resolve(__dirname, '..', '..', '..');
  if (!abs.startsWith(root) || abs.includes(`${path.sep}node_modules${path.sep}`)) {
    console.log(`lint-saved: skipping file outside project: ${file}`);
    process.exit(0);
  }
  execFile(process.execPath, ['--check', abs], (err, stdout, stderr) => {
    if (err) {
      console.log(`lint-saved: syntax error in ${file}\n${stderr || err.message}`);
      process.exit(1);
    }
    console.log(`lint-saved: OK ${file}`);
    process.exit(0);
  });
}

main();

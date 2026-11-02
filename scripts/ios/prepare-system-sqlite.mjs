/* global console, process */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const patchRoot = fileURLToPath(new URL('./sqlite-system-patches/', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(patchRoot, 'manifest.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Keep the upstream plugin API and Android backend; only its iOS backend changes.
export function prepareSystemSqlite(root) {
  const plugin = path.join(root, 'node_modules/@capacitor-community/sqlite');
  const { version } = JSON.parse(readFileSync(path.join(plugin, 'package.json'), 'utf8'));
  if (version !== manifest.version) throw new Error(`Review the iOS SQLite patch for plugin ${version}`);
  const pending = manifest.files.filter(entry => {
    const actual = digest(readFileSync(path.join(plugin, entry.file)));
    if (actual === entry.after) return false;
    if (actual !== entry.before) throw new Error(`Unexpected SQLite plugin source: ${entry.file}`);
    return true;
  });
  for (const entry of pending) {
    execFileSync('git', ['apply', '--directory=node_modules/@capacitor-community/sqlite',
      '--', path.join(patchRoot, entry.patch)], { cwd: root, stdio: 'pipe' });
    if (digest(readFileSync(path.join(plugin, entry.file))) !== entry.after) {
      throw new Error(`iOS SQLite patch did not produce the reviewed source: ${entry.file}`);
    }
  }
  return pending.length;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  console.log(`Prepared system SQLite iOS backend (${prepareSystemSqlite(root)} patched files)`);
}

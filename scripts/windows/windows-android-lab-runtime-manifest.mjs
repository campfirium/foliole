/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RUNTIME_ENTRYPOINTS = [
  'windows-android-lab-dispatcher.mjs',
  'windows-android-lab-receive.mjs',
  'windows-android-lab-runtime-update.mjs',
  'windows-android-lab-selfcheck.mjs',
  'windows-android-lab-worker.mjs'
];

const RUNTIME_COMPATIBILITY_FILES = [
  'windows-android-lab-review-audit.ts'
];

const RELATIVE_IMPORT_PATTERN = /(?:import\s+(?:[^'"]+\s+from\s+)?|import\s*\()\s*['"](\.[^'"]+)['"]/gu;

function normalizeRuntimeName(root, baseDir, specifier) {
  const resolved = path.normalize(path.join(baseDir, specifier));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.replaceAll(path.sep, '/');
}

function importedRuntimeFiles(source, root, fileName) {
  const files = [];
  const baseDir = path.dirname(path.join(root, fileName));
  for (const match of source.matchAll(RELATIVE_IMPORT_PATTERN)) {
    const imported = normalizeRuntimeName(root, baseDir, match[1]);
    if (imported && /\.(?:mjs|ts)$/u.test(imported)) files.push(imported);
  }
  return files;
}

export function resolveWindowsAndroidLabRuntimeFiles(root = path.dirname(fileURLToPath(import.meta.url))) {
  const normalizedRoot = path.resolve(root);
  return resolveWindowsAndroidLabRuntimeFilesFromSource((fileName) => {
    const fullPath = path.join(normalizedRoot, fileName);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return null;
    return fs.readFileSync(fullPath, 'utf8');
  }, normalizedRoot);
}

export function resolveWindowsAndroidLabRuntimeFilesFromSource(readSource, root = '.') {
  const pending = [...RUNTIME_ENTRYPOINTS, ...RUNTIME_COMPATIBILITY_FILES];
  const seen = new Set();
  while (pending.length) {
    const fileName = pending.shift();
    if (seen.has(fileName)) continue;
    const source = readSource(fileName);
    if (typeof source !== 'string') {
      throw new Error(`Windows Android Lab runtime source is missing: ${fileName}`);
    }
    seen.add(fileName);
    if (fileName.endsWith('.mjs') || fileName.endsWith('.ts')) {
      for (const imported of importedRuntimeFiles(source, root, fileName)) pending.push(imported);
    }
  }
  return [...seen].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] !== '--list') throw new Error('usage: windows-android-lab-runtime-manifest.mjs --list');
  process.stdout.write(`${resolveWindowsAndroidLabRuntimeFiles().join('\n')}\n`);
}

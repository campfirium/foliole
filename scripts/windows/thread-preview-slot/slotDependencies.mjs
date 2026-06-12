/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { ensureDir, normalizeRelPath, paths, uniqueSorted } from './slotCommon.mjs';

const MODULE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json'];
const INDEX_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json'];
const PREVIEW_ENTRY_FILES = ['src/app/styles.css'];

function localSpecifiers(sourceText) {
  const specs = [];
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]|@import\s+['"]([^'"]+)['"]/gu;
  let match = pattern.exec(sourceText);
  while (match) {
    const specifier = match[1] ?? match[2] ?? '';
    if (specifier.startsWith('.') || specifier.startsWith('@/')) specs.push(specifier);
    match = pattern.exec(sourceText);
  }
  return specs;
}

function dependencyCandidates(fromFile, specifier) {
  const base = specifier.startsWith('@/')
    ? normalizeRelPath(path.posix.join('src', specifier.slice(2)))
    : normalizeRelPath(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)));
  return [
    ...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...INDEX_EXTENSIONS.map((extension) => `${base}/index${extension}`)
  ];
}

function resolveRepoDependency(repoRoot, fromFile, specifier) {
  for (const candidate of dependencyCandidates(fromFile, specifier)) {
    const source = path.join(repoRoot, candidate);
    if (fs.existsSync(source) && fs.statSync(source).isFile()) return candidate;
  }
  return null;
}

function copyMissingFile(repoRoot, slotRoot, file) {
  const source = path.join(repoRoot, file);
  const target = path.join(slotRoot, file);
  const targetExists = fs.existsSync(target);
  if (targetExists && fs.readFileSync(source).equals(fs.readFileSync(target))) return false;
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  fs.utimesSync(target, new Date(), new Date());
  return targetExists ? 'updated' : 'copied';
}

export function syncMissingLocalDependencies(slot, seedFiles) {
  const p = paths(slot);
  const queue = uniqueSorted([...seedFiles, ...PREVIEW_ENTRY_FILES].map(normalizeRelPath));
  const visited = new Set();
  const dependencies = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const slotFile = path.join(p.slotDir, file);
    if (!fs.existsSync(slotFile) || !fs.statSync(slotFile).isFile()) continue;
    const text = fs.readFileSync(slotFile, 'utf8');
    for (const specifier of localSpecifiers(text)) {
      const dependency = resolveRepoDependency(p.repo, file, specifier);
      if (!dependency) continue;
      dependencies.push(dependency);
      const result = copyMissingFile(p.repo, p.slotDir, dependency);
      if (result) {
        console.log(`[preview-slot] ${result} preview dependency ${dependency}`);
      }
      queue.push(dependency);
    }
  }

  return uniqueSorted(dependencies);
}

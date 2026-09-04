#!/usr/bin/env node
/* global console, process */

import {
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  utimesSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, '../..');
const WINDOWS_MIRROR_ROOT = '/mnt/d/C/foliole';
const DAY_MS = 24 * 60 * 60 * 1000;

export const ARTIFACT_ROOT = '.tmp/artifacts';
export const CACHE_ROOT = '.cache';
export const ARTIFACT_RETENTION_DAYS = 1;
export const CACHE_RETENTION_DAYS = 30;
export const CACHE_MAX_BYTES = 10 * 1024 ** 3;

function resolveAllowedRoot(rootArg) {
  const rootDir = resolve(rootArg ?? repoRoot);
  if (![repoRoot, resolve(WINDOWS_MIRROR_ROOT)].includes(rootDir)) {
    throw new Error(`--root must be ${repoRoot} or ${WINDOWS_MIRROR_ROOT}`);
  }
  return rootDir;
}

function entrySizeBytes(entryPath) {
  const stats = lstatSync(entryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    return stats.size;
  }
  return readdirSync(entryPath).reduce(
    (total, name) => total + entrySizeBytes(resolve(entryPath, name)),
    0
  );
}

function listEntries(rootDir, relativeRoot) {
  const rootPath = resolve(rootDir, relativeRoot);
  if (!existsSync(rootPath)) {
    return [];
  }
  return readdirSync(rootPath).map((name) => {
    const path = resolve(rootPath, name);
    const stats = lstatSync(path);
    return { mtimeMs: stats.mtimeMs, name, path, sizeBytes: entrySizeBytes(path) };
  });
}

function artifactCandidates(rootDir, nowMs) {
  const cutoffMs = nowMs - ARTIFACT_RETENTION_DAYS * DAY_MS;
  return listEntries(rootDir, ARTIFACT_ROOT).flatMap((category) => {
    if (!lstatSync(category.path).isDirectory() || lstatSync(category.path).isSymbolicLink()) {
      return [];
    }
    return listEntries(rootDir, `${ARTIFACT_ROOT}/${category.name}`).map((entry) => ({
      ...entry, categoryName: category.name, runName: entry.name
    }));
  })
    .filter((entry) => entry.mtimeMs <= cutoffMs)
    .map((entry) => ({ ...entry, reason: 'expired', scope: 'artifact' }));
}

function cacheCandidates(rootDir, nowMs, maxCacheBytes) {
  const entries = listEntries(rootDir, CACHE_ROOT)
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.path.localeCompare(right.path));
  const cutoffMs = nowMs - CACHE_RETENTION_DAYS * DAY_MS;
  const selected = new Map();
  let retainedBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

  for (const entry of entries) {
    if (entry.mtimeMs <= cutoffMs) {
      selected.set(entry.path, { ...entry, reason: 'expired', scope: 'cache' });
      retainedBytes -= entry.sizeBytes;
    }
  }
  for (const entry of entries) {
    if (retainedBytes <= maxCacheBytes) {
      break;
    }
    if (!selected.has(entry.path)) {
      selected.set(entry.path, { ...entry, reason: 'capacity', scope: 'cache' });
      retainedBytes -= entry.sizeBytes;
    }
  }
  return [...selected.values()];
}

function removeCandidates(entries, removeEntry) {
  const failures = [];
  let deletedCount = 0;
  for (const entry of entries) {
    try {
      removeEntry(entry.path);
      deletedCount += 1;
    } catch (error) {
      failures.push({ message: error.message, path: entry.path });
    }
  }
  return { deletedCount, failures };
}

function assertEntryName(entryName) {
  if (!entryName || entryName.includes('/') || entryName.includes('\\') || entryName === '.' || entryName === '..') {
    throw new Error('retention entry must be one first-level directory name');
  }
}

function refreshRootEntry({ entryName, nowMs, relativeRoot, rootDir }) {
  assertEntryName(entryName);
  const entryPath = resolve(rootDir, relativeRoot, entryName);
  const stats = lstatSync(entryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error('retention entry must be an existing directory');
  }
  const time = new Date(nowMs);
  utimesSync(entryPath, time, time);
  return entryPath;
}

export function refreshArtifactRun({ categoryName, nowMs = Date.now(), rootDir = repoRoot, runName }) {
  assertEntryName(categoryName);
  return refreshRootEntry({
    entryName: runName, nowMs, relativeRoot: `${ARTIFACT_ROOT}/${categoryName}`, rootDir
  });
}

export function refreshCacheEntry({ entryName, nowMs = Date.now(), rootDir = repoRoot }) {
  return refreshRootEntry({ entryName, nowMs, relativeRoot: CACHE_ROOT, rootDir });
}

export function runRetention({
  apply = false,
  maxCacheBytes = CACHE_MAX_BYTES,
  nowMs = Date.now(),
  removeEntry = (path) => rmSync(path, { force: true, recursive: true }),
  rootDir = repoRoot,
  scope = 'all'
} = {}) {
  if (!['all', 'artifact', 'cache'].includes(scope)) {
    throw new Error('scope must be all, artifact, or cache');
  }
  const entries = [
    ...(scope === 'all' || scope === 'artifact' ? artifactCandidates(rootDir, nowMs) : []),
    ...(scope === 'all' || scope === 'cache' ? cacheCandidates(rootDir, nowMs, maxCacheBytes) : [])
  ];
  const outcome = apply ? removeCandidates(entries, removeEntry) : { deletedCount: 0, failures: [] };
  return { ...outcome, apply, entries, ok: outcome.failures.length === 0, rootDir, scope };
}

function parseArgs(argv = process.argv) {
  const rootIndex = argv.indexOf('--root');
  const scopeIndex = argv.indexOf('--scope');
  const touchIndex = argv.indexOf('--touch-cache');
  return {
    apply: argv.includes('--apply'),
    rootDir: resolveAllowedRoot(rootIndex >= 0 ? argv[rootIndex + 1] : undefined),
    scope: scopeIndex >= 0 ? argv[scopeIndex + 1] : 'all',
    touchEntry: touchIndex >= 0 ? argv[touchIndex + 1] : undefined
  };
}

function printResult(result) {
  const mode = result.apply ? 'APPLY' : 'DRY_RUN';
  console.log(`[local-retention] mode=${mode} scope=${result.scope} root=${result.rootDir} candidates=${result.entries.length}`);
  for (const entry of result.entries) {
    console.log(`[local-retention] ${entry.scope}:${entry.reason} ${entry.path}`);
  }
  for (const failure of result.failures) {
    console.error(`[local-retention] failed ${failure.path}: ${failure.message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs();
    if (options.touchEntry) {
      refreshCacheEntry({ entryName: options.touchEntry, rootDir: options.rootDir });
    }
    const result = runRetention(options);
    printResult(result);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`[local-retention] ${error.message}`);
    process.exitCode = 1;
  }
}

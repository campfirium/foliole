#!/usr/bin/env node
/* global console, process */

import { existsSync, lstatSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const WINDOWS_MIRROR_ROOT = '/mnt/d/C/foliole';
const DAY_MS = 24 * 60 * 60 * 1000;

export const CLEANUP_ROOTS = [
  '.tmp',
  'logs',
  'release',
  'artifacts/windows',
  'artifacts/windows-internal',
  'trees'
];
const PROTECTED_ROOTS = new Set(['.tmp/artifacts', '.tmp/worktrees']);

function isProtectedEntry(rootName, entryName, entryPath) {
  return PROTECTED_ROOTS.has(`${rootName}/${entryName}`)
    || existsSync(resolve(entryPath, '.git'));
}

function resolveAllowedRoot(rootArg) {
  const rootDir = resolve(rootArg ?? repoRoot);
  const allowedRoots = new Set([repoRoot, resolve(WINDOWS_MIRROR_ROOT)]);
  if (!allowedRoots.has(rootDir)) {
    throw new Error(`--root must be ${repoRoot} or ${WINDOWS_MIRROR_ROOT}`);
  }
  return rootDir;
}

function parseArgs(argv = process.argv) {
  const daysIndex = argv.indexOf('--days');
  const rootIndex = argv.indexOf('--root');
  const days = daysIndex >= 0 ? Number(argv[daysIndex + 1]) : 7;
  if (!Number.isFinite(days) || days < 0) {
    throw new Error('--days must be a non-negative number');
  }
  return {
    apply: argv.includes('--apply'),
    days,
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply'),
    rootDir: resolveAllowedRoot(rootIndex >= 0 ? argv[rootIndex + 1] : undefined)
  };
}

function directorySizeBytes(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = resolve(path, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += statSync(entryPath).size;
    }
  }
  return total;
}

function collectEntries(rootDir, nowMs, days) {
  const cutoffMs = nowMs - days * DAY_MS;
  const results = [];
  for (const rootName of CLEANUP_ROOTS) {
    const rootPath = resolve(rootDir, rootName);
    if (!existsSync(rootPath)) {
      continue;
    }
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const entryPath = resolve(rootPath, entry.name);
      if (isProtectedEntry(rootName, entry.name, entryPath)) continue;
      const stats = lstatSync(entryPath);
      if (stats.mtimeMs <= cutoffMs) {
        results.push({
          mtimeMs: stats.mtimeMs,
          path: entryPath,
          rootName,
          sizeBytes: entry.isDirectory() ? directorySizeBytes(entryPath) : stats.size
        });
      }
    }
  }
  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function removeEmptyChildren(rootDir) {
  for (const rootName of CLEANUP_ROOTS) {
    const rootPath = resolve(rootDir, rootName);
    if (!existsSync(rootPath)) {
      continue;
    }
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      const entryPath = resolve(rootPath, entry.name);
      if (!entry.isDirectory() || isProtectedEntry(rootName, entry.name, entryPath)) {
        continue;
      }
      if (readdirSync(entryPath).length === 0) {
        rmSync(entryPath, { force: true, recursive: true });
      }
    }
    if (readdirSync(rootPath).length === 0) {
      rmSync(rootPath, { force: true, recursive: true });
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${Math.round(bytes / 1024 / 1024)}MB`;
}

export function runCleanup({
  apply,
  days,
  dryRun,
  nowMs = Date.now(),
  rootDir = repoRoot
}) {
  const entries = collectEntries(rootDir, nowMs, days);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (apply) {
    for (const entry of entries) {
      rmSync(entry.path, { force: true, recursive: true });
    }
    removeEmptyChildren(rootDir);
  }
  return {
    days,
    deletedCount: apply ? entries.length : 0,
    dryRun,
    entries,
    rootDir,
    totalBytes
  };
}

function printSummary(result) {
  const mode = result.dryRun ? 'DRY_RUN' : 'APPLIED';
  console.log(`[cleanup-local-artifacts] mode=${mode} root=${result.rootDir} days=${result.days} candidates=${result.entries.length} size=${formatBytes(result.totalBytes)}`);
  for (const entry of result.entries.slice(0, 80)) {
    console.log(`[cleanup-local-artifacts] ${entry.rootName}: ${entry.path}`);
  }
  if (result.entries.length > 80) {
    console.log(`[cleanup-local-artifacts] omitted=${result.entries.length - 80}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs();
    printSummary(runCleanup(options));
  } catch (error) {
    console.error(`[cleanup-local-artifacts] ${error.message}`);
    process.exitCode = 1;
  }
}

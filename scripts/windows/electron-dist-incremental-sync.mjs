#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_PREFIXES = ['electron/', 'lib/core/', 'lib/platform/'];
const FALLBACK = 2;

function parseArgs(argv) {
  const options = {
    changedFiles: process.env.WINDOWS_PREVIEW_CHANGED_FILES ?? '',
    mirrorDir: process.env.WINDOWS_MIRROR_DIR ?? '/mnt/d/C/foliole',
    repoRoot: process.env.ELECTRON_DIST_SYNC_REPO_ROOT ?? REPO_ROOT
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--changed-files' && value !== undefined) options.changedFiles = value;
    if (key === '--mirror-dir' && value) options.mirrorDir = value;
    if (key === '--repo-root' && value) options.repoRoot = path.resolve(value);
    if (key.startsWith('--') && value !== undefined) index += 1;
  }
  return options;
}

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isRuntimeSource(filePath) {
  const normalized = normalizePath(filePath);
  if (!SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  if (/\.(test|spec)\.ts$/.test(normalized)) return false;
  return normalized.endsWith('.ts');
}

function isRuntimeTestSource(filePath) {
  const normalized = normalizePath(filePath);
  return SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix)) && /\.(test|spec)\.ts$/.test(normalized);
}

function isKnownRuntimePath(filePath) {
  const normalized = normalizePath(filePath);
  return SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function distPathForSource(filePath) {
  return `dist/${normalizePath(filePath).replace(/\.ts$/, '.js')}`;
}

function resolveChangedFiles(options) {
  if (options.changedFiles.trim()) {
    return options.changedFiles.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  }
  const stampFile = process.env.WINDOWS_PREVIEW_SYNC_STAMP_FILE ?? '.lab/internal/runtime/windows-sync.stamp';
  const stampPath = path.isAbsolute(stampFile) ? stampFile : path.join(options.repoRoot, stampFile);
  const newestAllowedMtime = existsSync(stampPath) ? fs.statSync(stampPath).mtimeMs : 0;
  return SOURCE_PREFIXES.flatMap((prefix) => collectRuntimeFiles(path.join(options.repoRoot, prefix), options.repoRoot, newestAllowedMtime));
}

function collectRuntimeFiles(rootPath, repoRoot, newestAllowedMtime) {
  if (!existsSync(rootPath)) return [];
  const files = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile() && fs.statSync(entryPath).mtimeMs > newestAllowedMtime) {
        files.push(normalizePath(path.relative(repoRoot, entryPath)));
      }
    }
  }
  return files;
}

function createSyncPlan(options) {
  const changedFiles = resolveChangedFiles(options);
  const runtimeFiles = changedFiles.filter(isKnownRuntimePath).filter((file) => !isRuntimeTestSource(file));
  if (runtimeFiles.length === 0) {
    return { files: [], reason: 'no-runtime-files', status: 'skip' };
  }
  if (!existsSync(options.mirrorDir)) {
    return { reason: 'mirror-missing', status: 'fallback' };
  }
  const distFiles = [];
  for (const file of runtimeFiles) {
    if (!isRuntimeSource(file)) {
      return { reason: `unsupported-runtime-path:${file}`, status: 'fallback' };
    }
    const distFile = distPathForSource(file);
    if (!existsSync(path.join(options.repoRoot, distFile))) {
      return { reason: `dist-output-missing:${distFile}`, status: 'fallback' };
    }
    distFiles.push(distFile);
  }
  return { files: [...new Set(distFiles)].sort(), reason: 'runtime-outputs', status: 'sync' };
}

function runRsync(options, files) {
  const args = ['-Rlt', '--inplace', '--no-perms', '--no-owner', '--no-group', ...files, options.mirrorDir];
  const result = spawnSync('rsync', args, {
    cwd: options.repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

export function planElectronDistIncrementalSync(rawOptions = {}) {
  return createSyncPlan({
    changedFiles: rawOptions.changedFiles ?? '',
    mirrorDir: rawOptions.mirrorDir ?? '/mnt/d/C/foliole',
    repoRoot: rawOptions.repoRoot ?? REPO_ROOT
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = createSyncPlan(options);
  if (plan.status === 'skip') {
    console.log(`[electron-runtime-sync] status: SKIPPED reason=${plan.reason}`);
    return 0;
  }
  if (plan.status === 'fallback') {
    console.log(`[electron-runtime-sync] status: FALLBACK reason=${plan.reason}`);
    return FALLBACK;
  }
  const exitCode = runRsync(options, plan.files);
  if (exitCode !== 0) {
    console.log(`[electron-runtime-sync] status: FALLBACK reason=rsync-failed code=${exitCode}`);
    return FALLBACK;
  }
  console.log(`[electron-runtime-sync] status: SYNCED files=${plan.files.length}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

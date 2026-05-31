#!/usr/bin/env node
/* global console, process, setInterval, clearInterval, setTimeout, clearTimeout */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeRendererReloadIntent } from './write-renderer-reload-intent.mjs';
import { writeRestartIntent } from './write-restart-intent.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WATCH_ROOTS = ['src', 'electron', 'lib/core', 'lib/platform'];
const WATCH_FILES = ['package.json', 'package-lock.json', 'vite.config.ts', 'vite.shared.ts', 'postcss.config.js', 'tailwind.config.js'];
const IGNORE_PARTS = new Set(['.git', '.lab', '.tmp', 'node_modules', 'dist', 'electron-dist', 'logs', 'coverage']);
const RUNTIME_PREFIXES = ['electron/', 'lib/core/', 'lib/platform/'];
const RENDERER_PREFIXES = ['src/app/', 'src/features/', 'src/shared/', 'src/store/'];
const SHELL_FILES = new Set(['package.json', 'package-lock.json', 'vite.config.ts', 'vite.shared.ts', 'postcss.config.js', 'tailwind.config.js']);

function normalize(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isIgnoredPath(filePath) {
  return normalize(filePath).split('/').some((part) => IGNORE_PARTS.has(part) || part.startsWith('.tmp-'));
}

function shouldTrackFile(filePath) {
  const file = normalize(filePath);
  if (isIgnoredPath(file)) return false;
  if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file)) return false;
  return true;
}

function walkFiles(rootPath, repoRoot, result = new Map()) {
  if (!fs.existsSync(rootPath)) return result;
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    const relative = normalize(path.relative(repoRoot, rootPath));
    if (shouldTrackFile(relative)) result.set(relative, stat.mtimeMs);
    return result;
  }
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = path.join(rootPath, entry.name);
    const relative = normalize(path.relative(repoRoot, fullPath));
    if (isIgnoredPath(relative)) continue;
    if (entry.isDirectory()) {
      walkFiles(fullPath, repoRoot, result);
    } else if (entry.isFile() && shouldTrackFile(relative)) {
      result.set(relative, fs.statSync(fullPath).mtimeMs);
    }
  }
  return result;
}

export function snapshotWorkspace(repoRoot = REPO_ROOT) {
  const snapshot = new Map();
  for (const root of WATCH_ROOTS) {
    walkFiles(path.join(repoRoot, root), repoRoot, snapshot);
  }
  for (const file of WATCH_FILES) {
    walkFiles(path.join(repoRoot, file), repoRoot, snapshot);
  }
  return snapshot;
}

export function diffSnapshots(previous, next) {
  const changed = new Set();
  let hasDeletion = false;
  for (const [file, mtime] of next) {
    if (previous.get(file) !== mtime) changed.add(file);
  }
  for (const file of previous.keys()) {
    if (!next.has(file)) {
      changed.add(file);
      hasDeletion = true;
    }
  }
  return { changedFiles: [...changed].sort(), hasDeletion };
}

export function classifyBatch(changedFiles) {
  const files = changedFiles.map(normalize);
  if (files.some((file) => SHELL_FILES.has(file))) return 'shell';
  if (files.some((file) => RUNTIME_PREFIXES.some((prefix) => file.startsWith(prefix)))) return 'runtime';
  if (files.some((file) => RENDERER_PREFIXES.some((prefix) => file.startsWith(prefix)))) return 'renderer';
  return 'sync-only';
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'}`));
    });
  });
}

async function syncBatch({ action, changedFiles, hasDeletion, mirrorDir, repoRoot }) {
  const changedFilesText = changedFiles.join('\n');
  if (action === 'runtime') {
    await runCommand('npm', ['run', 'electron:compile'], { cwd: repoRoot });
    try {
      await runCommand(process.execPath, ['scripts/windows/electron-dist-incremental-sync.mjs', '--changed-files', changedFilesText], { cwd: repoRoot });
    } catch {
      process.env.WINDOWS_SYNC_INCLUDE_ELECTRON_DIST = '1';
      process.env.WINDOWS_SYNC_FORCE_FULL = '1';
    }
  }
  await runCommand('bash', ['scripts/windows/windows-sync.sh'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WINDOWS_MIRROR_DIR: mirrorDir,
      WINDOWS_SYNC_CHANGED_FILES: hasDeletion ? '' : changedFilesText,
      WINDOWS_SYNC_FORCE_FULL: hasDeletion ? '1' : process.env.WINDOWS_SYNC_FORCE_FULL ?? ''
    }
  });
}

async function publishIntent({ action, mirrorDir }) {
  if (action === 'renderer') {
    const result = await writeRendererReloadIntent({
      reason: 'windows sync watch renderer batch',
      requestedBy: 'windows-sync-watch',
      rootDir: mirrorDir
    });
    console.log(`[windows-sync-watch] renderer reload nonce=${result.intent.nonce}`);
  }
  if (action === 'runtime') {
    const result = await writeRestartIntent({
      reason: 'windows sync watch runtime batch',
      requestedBy: 'windows-sync-watch',
      rootDir: mirrorDir
    });
    console.log(`[windows-sync-watch] restart nonce=${result.intent.nonce}`);
  }
  if (action === 'shell') {
    console.log('[windows-sync-watch] shell config changed; restart dev shell manually or run windows:preview');
  }
}

export async function processBatch({ changedFiles, hasDeletion, mirrorDir, repoRoot = REPO_ROOT }) {
  if (changedFiles.length === 0) return;
  const action = classifyBatch(changedFiles);
  console.log(`[windows-sync-watch] batch files=${changedFiles.length} action=${action}`);
  await syncBatch({ action, changedFiles, hasDeletion, mirrorDir, repoRoot });
  await publishIntent({ action, mirrorDir });
}

async function main() {
  const mirrorDir = process.env.WINDOWS_MIRROR_DIR || '/mnt/d/C/foliole';
  const pollMs = Number.parseInt(process.env.WINDOWS_SYNC_WATCH_POLL_MS || '1000', 10);
  const quietMs = Number.parseInt(process.env.WINDOWS_SYNC_WATCH_QUIET_MS || '1200', 10);
  let previous = snapshotWorkspace(REPO_ROOT);
  let pending = new Set();
  let pendingDeletion = false;
  let timer = null;
  let running = false;

  const flush = async () => {
    if (running) return;
    running = true;
    const changedFiles = [...pending].sort();
    const hasDeletion = pendingDeletion;
    pending = new Set();
    pendingDeletion = false;
    try {
      await processBatch({ changedFiles, hasDeletion, mirrorDir });
    } catch (error) {
      console.error(`[windows-sync-watch] batch failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };

  console.log(`[windows-sync-watch] watching ${REPO_ROOT} -> ${mirrorDir}`);
  const interval = setInterval(() => {
    const next = snapshotWorkspace(REPO_ROOT);
    const diff = diffSnapshots(previous, next);
    previous = next;
    if (diff.changedFiles.length === 0) return;
    for (const file of diff.changedFiles) pending.add(file);
    pendingDeletion ||= diff.hasDeletion;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, quietMs);
  }, pollMs);

  process.on('SIGINT', () => {
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    process.exit(0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[windows-sync-watch] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

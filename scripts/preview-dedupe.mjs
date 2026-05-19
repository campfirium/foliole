#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runScheduledPreview, shouldForcePreview } from './preview-dedupe-scheduler.mjs';
import { buildDiagnostics, formatDiagnosticsSummary } from './preview-dedupe-diagnostics.mjs';
import { appendPreviewEvent } from './preview-dedupe-event-log.mjs';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(process.env.PREVIEW_DEDUPE_REPO_ROOT ?? DEFAULT_REPO_ROOT);
const VALID_TARGETS = new Set(['android', 'windows']);
const TARGET_PATHS = {
  android: [
    'android/',
    'scripts/preview-dedupe-scheduler.mjs',
    'scripts/preview-dedupe-state-store.mjs',
    'scripts/preview-dedupe-event-log.mjs',
    'scripts/preview-dedupe.mjs',
    'scripts/android/',
    'src/companion/',
    'src/shared/',
    'src/features/',
    'lib/',
    'package.json',
    'package-lock.json',
    'capacitor.config.ts',
    'vite.companion.config.ts'
  ],
  windows: [
    'electron/',
    'scripts/preview-dedupe-scheduler.mjs',
    'scripts/preview-dedupe-state-store.mjs',
    'scripts/preview-dedupe-event-log.mjs',
    'scripts/preview-dedupe.mjs',
    'scripts/windows/',
    'src/app/',
    'src/features/',
    'src/shared/',
    'src/store/',
    'lib/',
    'package.json',
    'package-lock.json',
    'index.html',
    'vite.config.ts',
    'playwright.desktop.config.ts'
  ]
};

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const target = argv[0];
  const command = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  return { command, target };
}

function runGitBuffer(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim();
    throw new Error(detail || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function isTargetPath(target, filePath) {
  return TARGET_PATHS[target]?.some((targetPath) => (targetPath.endsWith('/') ? filePath.startsWith(targetPath) : filePath === targetPath)) ?? true;
}

function listUntrackedFiles(target) {
  const runtimeRoot = runtimeDir();
  const output = runGitBuffer(['ls-files', '--others', '--exclude-standard', '-z']);
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((filePath) => isTargetPath(target, filePath))
    .filter((filePath) => !path.resolve(REPO_ROOT, filePath).startsWith(`${runtimeRoot}${path.sep}`))
    .sort();
}

async function workspaceHash(target) {
  const hash = createHash('sha256');
  hash.update('tracked-diff\0');
  hash.update(runGitBuffer(['diff', '--binary', 'HEAD', '--', ...TARGET_PATHS[target]]));
  for (const filePath of listUntrackedFiles(target)) {
    hash.update('\0untracked\0');
    hash.update(filePath);
    hash.update('\0');
    hash.update(await readFile(path.join(REPO_ROOT, filePath)));
  }
  return hash.digest('hex');
}

function runtimeDir() {
  return path.resolve(REPO_ROOT, process.env.PREVIEW_DEDUPE_RUNTIME_DIR ?? '.lab/internal/runtime');
}

function hashPath(target) {
  return path.join(runtimeDir(), `${target}-preview.hash`);
}

async function readStoredHash(target) {
  try {
    return (await readFile(hashPath(target), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function writeStoredHash(target, hash) {
  await mkdir(runtimeDir(), { recursive: true });
  await writeFile(hashPath(target), `${hash}\n`, 'utf8');
}

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit'
    });
    child.on('close', (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function runWindowsStatusCommand() {
  const command = process.env.PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND
    ? ['bash', '-lc', process.env.PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND]
    : ['bash', 'scripts/windows/windows-restart-client.sh'];
  return spawnSync(command[0], command.slice(1), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      WINDOWS_CLIENT_ACTION: 'status'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function isWindowsRuntimeRunning() {
  const result = runWindowsStatusCommand();
  if (result.status !== 0) {
    return false;
  }
  return (
    /\[windows-restart-client\]\s+status:\s+RUNNING\b/.test(result.stdout) &&
    !/\bresponding=False\b/.test(result.stdout)
  );
}

function canSkipCoveredPreview(target) {
  if (target !== 'windows') {
    return true;
  }
  return isWindowsRuntimeRunning();
}

async function logDiagnostics(target, stage) {
  if (process.env.PREVIEW_DEDUPE_DIAGNOSTICS === '0') {
    return;
  }
  try {
    const diagnostics = await buildDiagnostics({ runtimeDir: runtimeDir(), target, windowsStatus: target === 'windows' });
    console.log(`[${target}-preview] diagnostics ${stage}: ${JSON.stringify(formatDiagnosticsSummary(diagnostics))}`);
  } catch (error) {
    console.log(`[${target}-preview] diagnostics ${stage}: unavailable ${error.message}`);
  }
}

function logEvent(target, event, fields) {
  return appendPreviewEvent({ event, fields, runtimeDir: runtimeDir(), target });
}

async function runPreviewFlow({ command, requireActualPreview, target }) {
  const currentHash = await workspaceHash(target);
  const storedHash = await readStoredHash(target);
  const forced = shouldForcePreview();
  await logEvent(target, 'hash-compared', { currentHash, forced, requireActualPreview, storedHash: storedHash || null });
  if (!forced && storedHash === currentHash) {
    if (canSkipCoveredPreview(target)) {
      await logEvent(target, 'real-preview-skipped', { action: 'skip-real-preview', currentHash, reason: 'covered-running-runtime' });
      console.log(`[${target}-preview] dedupe: covered hash=${currentHash} action=skip-real-preview`);
      console.log(`[${target}-preview] status: ${target === 'windows' ? 'STARTED' : 'SYNCED'}`);
      return { exitCode: 0, hash: currentHash, previewed: target === 'windows' };
    }
    await logEvent(target, 'covered-runtime-stale', { currentHash, reason: 'covered-hash-runtime-not-running' });
    console.log(`[${target}-preview] dedupe: stale-covered hash=${currentHash}`);
  }

  await logEvent(target, 'real-preview-claimed', { currentHash, forced, requireActualPreview, storedHash: storedHash || null });
  console.log(`[${target}-preview] dedupe: claimed hash=${currentHash}`);
  const exitCode = await runCommand(command);
  await logEvent(target, 'real-preview-finished', { currentHash, exitCode });
  if (exitCode === 0) {
    await writeStoredHash(target, currentHash);
  }
  return { exitCode, hash: currentHash, previewed: true };
}

async function main() {
  const { command, target } = parseArgs(process.argv.slice(2));
  if (!VALID_TARGETS.has(target) || command.length === 0) {
    console.error('Usage: node scripts/preview-dedupe.mjs <windows|android> -- <preview command...>');
    return 2;
  }

  await logDiagnostics(target, 'before');
  const exitCode = await runScheduledPreview({
    runPreview: ({ requireActualPreview }) => runPreviewFlow({ command, requireActualPreview, target }),
    runtimeDir: runtimeDir(),
    target
  });
  await logDiagnostics(target, 'after');
  return exitCode;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error(`[preview-dedupe] ${error.message}`);
    process.exitCode = 1;
  });

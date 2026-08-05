#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runScheduledPreview, shouldForcePreview } from './preview-dedupe-scheduler.mjs';
import { runPreviewCommand } from './preview-dedupe-command-runner.mjs';
import { buildDiagnostics, formatDiagnosticsSummary } from './preview-dedupe-diagnostics.mjs';
import { appendPreviewEvent } from './preview-dedupe-event-log.mjs';
import { TARGET_PATHS } from './preview-dedupe-targets.mjs';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO_ROOT = path.resolve(process.env.PREVIEW_DEDUPE_REPO_ROOT ?? DEFAULT_REPO_ROOT);
const VALID_TARGETS = new Set(['android', 'windows']);

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

function listUntrackedFiles(target) {
  const runtimeRoot = runtimeDir();
  const output = runGitBuffer(['ls-files', '--others', '--exclude-standard', '-z', '--', ...TARGET_PATHS[target]]);
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((filePath) => !path.resolve(REPO_ROOT, filePath).startsWith(`${runtimeRoot}${path.sep}`))
    .sort();
}

function listTrackedChangedFiles(target) {
  const output = runGitBuffer(['diff', '--name-only', '-z', 'HEAD', '--', ...TARGET_PATHS[target]]);
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

async function hashWorktreeFile(hash, filePath) {
  hash.update(filePath);
  hash.update('\0');
  try {
    hash.update(await readFile(path.join(REPO_ROOT, filePath)));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    hash.update('\0deleted\0');
  }
}

async function workspaceHash(target) {
  const hash = createHash('sha256');
  hash.update('head-targets\0');
  hash.update(runGitBuffer(['ls-tree', '-rz', '-r', 'HEAD', '--', ...TARGET_PATHS[target]]));
  hash.update('tracked-diff\0');
  for (const filePath of listTrackedChangedFiles(target)) {
    hash.update('\0tracked\0');
    await hashWorktreeFile(hash, filePath);
  }
  for (const filePath of listUntrackedFiles(target)) {
    hash.update('\0untracked\0');
    await hashWorktreeFile(hash, filePath);
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

function runWindowsStatusCommand() {
  let command = [process.execPath, 'scripts/windows/windows-client-native.mjs', 'status'];
  if (process.env.PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND) {
    command = process.platform === 'win32'
      ? [process.env.ComSpec || 'cmd.exe', '/d', '/s', '/c', process.env.PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND]
      : ['bash', '-lc', process.env.PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND];
  }
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

function previewStatus(target) {
  return target === 'windows' ? 'STARTED' : 'SYNCED';
}

function readWaitOnFailureForCommand() {
  if (process.env.PREVIEW_DEDUPE_WAIT_ON_FAILURE !== undefined) {
    return process.env.PREVIEW_DEDUPE_WAIT_ON_FAILURE === '1';
  }
  return false;
}

function shouldRequireActualPreview(requireActualPreview) {
  return requireActualPreview || process.env.PREVIEW_DEDUPE_REQUIRE_ACTUAL === '1';
}

function buildPreviewCommandEnv(target, forced, requireActualPreview) {
  if (target !== 'windows' || (!forced && !requireActualPreview)) {
    return {};
  }
  return { WINDOWS_PREVIEW_REQUIRE_REFRESH: '1' };
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
  const effectiveRequireActualPreview = shouldRequireActualPreview(requireActualPreview);
  await logEvent(target, 'hash-compared', { currentHash, forced, requireActualPreview: effectiveRequireActualPreview, storedHash: storedHash || null });
  if (!forced && !effectiveRequireActualPreview && storedHash === currentHash) {
    if (canSkipCoveredPreview(target)) {
      await logEvent(target, 'real-preview-skipped', { action: 'skip-real-preview', currentHash, reason: 'covered-running-runtime' });
      console.log(`[${target}-preview] dedupe: covered hash=${currentHash} action=skip-real-preview`);
      console.log(`[${target}-preview] status: ${previewStatus(target)}`);
      return { exitCode: 0, hash: currentHash, previewed: target === 'windows' };
    }
    await logEvent(target, 'covered-runtime-stale', { currentHash, reason: 'covered-hash-runtime-not-running' });
    console.log(`[${target}-preview] dedupe: stale-covered hash=${currentHash}`);
  }

  await logEvent(target, 'real-preview-claimed', { currentHash, forced, requireActualPreview: effectiveRequireActualPreview, storedHash: storedHash || null });
  console.log(`[${target}-preview] dedupe: claimed hash=${currentHash}`);
  const exitCode = await runPreviewCommand(
    command,
    target,
    REPO_ROOT,
    buildPreviewCommandEnv(target, forced, effectiveRequireActualPreview)
  );
  await logEvent(target, 'real-preview-finished', { currentHash, exitCode });
  if (exitCode === 0) {
    await writeStoredHash(target, currentHash);
    console.log(`[${target}-preview] status: ${previewStatus(target)}`);
  }
  return { exitCode, hash: currentHash, previewed: true };
}

async function main() {
  const { command, target } = parseArgs(process.argv.slice(2));
  if (!VALID_TARGETS.has(target) || command.length === 0) {
    console.error('Usage: node scripts/preview/preview-dedupe.mjs <windows|android> -- <preview command...>');
    return 2;
  }

  await logDiagnostics(target, 'before');
  const exitCode = await runScheduledPreview({
    runPreview: ({ requireActualPreview }) => runPreviewFlow({ command, requireActualPreview, target }),
    runtimeDir: runtimeDir(),
    target,
    waitOnFailure: readWaitOnFailureForCommand()
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

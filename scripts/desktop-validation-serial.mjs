/* global process */

import { open, mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_POLL_MS = 1_000;
const DEFAULT_PROGRESS_MS = 30_000;
const LOCK_FILE_NAME = 'desktop-validation-serial.lock';
const LOG_PREFIX = '[desktop-validation-serial]';
let activeChild = null;

export function formatQueueActiveMessage({ ageSeconds, pid }) {
  return `${LOG_PREFIX} queue held by pid ${pid}; elapsed ${ageSeconds}s`;
}

export function isPidAlive(pid) {
  try {
    return Number.isInteger(pid) && pid > 0 && process.kill(pid, 0);
  } catch {
    return false;
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveRuntimeDir() {
  return process.env.DESKTOP_VALIDATION_SERIAL_RUNTIME_DIR ?? path.join(REPO_ROOT, '.lab', 'internal', 'runtime');
}

function resolveCommands() {
  const encoded = process.env.DESKTOP_VALIDATION_SERIAL_COMMANDS_JSON;
  if (encoded) {
    const commands = JSON.parse(encoded);
    if (!Array.isArray(commands) || commands.some((command) => !isCommandTuple(command))) {
      throw new Error('DESKTOP_VALIDATION_SERIAL_COMMANDS_JSON must be a JSON array of command arrays.');
    }
    return commands;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return [
    [npmCommand, 'run', 'lint:desktop'],
    [npmCommand, 'run', 'windows:preview:native']
  ];
}

function isCommandTuple(command) {
  return Array.isArray(command) && command.length > 0 && command.every((part) => typeof part === 'string');
}

async function readLock(lockFile) {
  try {
    return JSON.parse(await readFile(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

async function tryAcquireLock(lockFile) {
  let handle = null;
  try {
    await mkdir(path.dirname(lockFile), { recursive: true });
    handle = await open(lockFile, 'wx');
    await handle.writeFile(
      `${JSON.stringify({ command: 'validate:desktop:serial', pid: process.pid, startedAt: Date.now() })}\n`,
      'utf8'
    );
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
    return false;
  } finally {
    await handle?.close();
  }
}

async function removeDeadOwnerLock(lockFile) {
  const lock = await readLock(lockFile);
  if (!lock || !isPidAlive(Number(lock.pid))) {
    await rm(lockFile, { force: true });
    return true;
  }
  return false;
}

async function acquireSerialLock(lockFile) {
  const pollMs = parsePositiveInt(process.env.DESKTOP_VALIDATION_SERIAL_POLL_MS, DEFAULT_POLL_MS);
  const progressMs = parsePositiveInt(process.env.DESKTOP_VALIDATION_SERIAL_PROGRESS_MS, DEFAULT_PROGRESS_MS);
  let lastProgressAt = 0;

  while (!(await tryAcquireLock(lockFile))) {
    if (await removeDeadOwnerLock(lockFile)) {
      continue;
    }
    lastProgressAt = await printQueueProgress(lockFile, lastProgressAt, progressMs);
    await delay(pollMs);
  }
}

async function printQueueProgress(lockFile, lastProgressAt, progressMs) {
  const now = Date.now();
  if (now - lastProgressAt < progressMs) {
    return lastProgressAt;
  }

  const lock = await readLock(lockFile);
  if (lock?.pid) {
    const ageSeconds = Math.max(0, Math.round((now - Number(lock.startedAt ?? now)) / 1000));
    process.stdout.write(`${formatQueueActiveMessage({ ageSeconds, pid: lock.pid })}\n`);
  }
  return now;
}

async function releaseOwnLock(lockFile) {
  const lock = await readLock(lockFile);
  if (Number(lock?.pid) === process.pid) {
    await rm(lockFile, { force: true });
  }
}

function installSignalCleanup(lockFile) {
  let exiting = false;
  const cleanupThenExit = (code, signal) => {
    if (exiting) {
      return;
    }
    exiting = true;
    stopActiveChild(signal)
      .finally(() => releaseOwnLock(lockFile))
      .finally(() => process.exit(code));
  };
  process.once('SIGINT', () => cleanupThenExit(130, 'SIGINT'));
  process.once('SIGTERM', () => cleanupThenExit(143, 'SIGTERM'));
}

function stopActiveChild(signal) {
  if (!activeChild || activeChild.exitCode !== null || activeChild.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, 1_000);
    activeChild.once('close', () => {
      globalThis.clearTimeout(timer);
      resolve();
    });
    activeChild.kill(signal);
  });
}

function runCommand(command) {
  return new Promise((resolve) => {
    const [bin, ...args] = command;
    const child = spawn(bin, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: 'inherit'
    });
    activeChild = child;
    child.on('error', (error) => {
      process.stderr.write(`${LOG_PREFIX} command launch error: ${error.message}\n`);
      resolve(1);
    });
    child.on('close', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }
      resolve(signal ? 1 : code ?? 1);
    });
  });
}

async function runCommands(commands) {
  for (const command of commands) {
    const code = await runCommand(command);
    if (code !== 0) {
      return code;
    }
  }
  return 0;
}

export async function runDesktopValidationSerial() {
  const lockFile = path.join(resolveRuntimeDir(), LOCK_FILE_NAME);
  installSignalCleanup(lockFile);
  await acquireSerialLock(lockFile);
  try {
    return await runCommands(resolveCommands());
  } finally {
    await releaseOwnLock(lockFile);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDesktopValidationSerial()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${LOG_PREFIX} ${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}

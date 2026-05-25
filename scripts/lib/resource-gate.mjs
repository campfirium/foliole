/* global process */

import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_PROGRESS_MS = 30_000;
const DEFAULT_STALE_MS = 60 * 60_000;
const DEFAULT_HEARTBEAT_MS = 30_000;
const HELD_ENV = 'FOLIOLE_RESOURCE_GATE_HELD';
const LOG_PREFIX = '[validation-resource-gate]';
const RESOURCE_ORDER = ['node-heavy', 'preview', 'exclusive'];
const RESOURCE_CLASSES = {
  exclusive: ['node-heavy', 'preview', 'exclusive'],
  'node-heavy': ['node-heavy'],
  preview: ['node-heavy', 'preview']
};

export function formatGateQueueMessage({ className, holderPid, resource, seconds }) {
  return `${LOG_PREFIX} queue held_by_class=${className} resource=${resource} holder_pid=${holderPid} elapsed=${seconds}s eta=unknown`;
}

export function isPidAlive(pid) {
  try {
    return Number.isInteger(pid) && pid > 0 && process.kill(pid, 0);
  } catch {
    return false;
  }
}

export function resourcesForClass(className) {
  const resources = RESOURCE_CLASSES[className];
  if (!resources) {
    throw new Error(`unknown resource gate class: ${className}`);
  }
  return resources.toSorted((left, right) => RESOURCE_ORDER.indexOf(left) - RESOURCE_ORDER.indexOf(right));
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function heldResources(env = process.env) {
  return new Set(
    (env[HELD_ENV] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function runtimeDir(repoRoot, env = process.env) {
  return path.resolve(repoRoot, env.FOLIOLE_RESOURCE_GATE_RUNTIME_DIR ?? env.DESKTOP_VALIDATION_SERIAL_RUNTIME_DIR ?? '.lab/internal/runtime');
}

function lockPath(repoRoot, resource, env = process.env) {
  return path.join(runtimeDir(repoRoot, env), `resource-gate.${resource}.lock`);
}

async function readLock(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeLock(filePath, lock) {
  await writeFile(filePath, `${JSON.stringify(lock)}\n`, 'utf8');
}

async function tryAcquireLock({ className, commandLabel, filePath, resource }) {
  let handle = null;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    handle = await open(filePath, 'wx');
    await handle.writeFile(`${JSON.stringify({
      className,
      command: commandLabel,
      heartbeatAt: Date.now(),
      pid: process.pid,
      resource,
      schemaVersion: 1,
      startedAt: Date.now()
    })}\n`);
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

function isLockStale(lock, staleMs) {
  if (!lock || lock.schemaVersion !== 1) {
    return true;
  }
  const lastSeenAt = Number(lock.heartbeatAt ?? lock.startedAt ?? 0);
  const staleByTime = !Number.isFinite(lastSeenAt) || Date.now() - lastSeenAt > staleMs;
  return !isPidAlive(Number(lock.pid)) || staleByTime;
}

async function removeStaleLock(filePath, staleMs) {
  const lock = await readLock(filePath);
  if (isLockStale(lock, staleMs)) {
    await rm(filePath, { force: true });
    return true;
  }
  return false;
}

async function printQueueProgress({ filePath, lastProgressAt, progressMs, resource }) {
  const now = Date.now();
  if (now - lastProgressAt < progressMs) {
    return lastProgressAt;
  }
  const lock = await readLock(filePath);
  if (lock?.pid) {
    const seconds = Math.max(0, Math.round((now - Number(lock.startedAt ?? now)) / 1000));
    process.stdout.write(`${formatGateQueueMessage({
      className: lock.className ?? 'unknown',
      holderPid: lock.pid,
      resource,
      seconds
    })}\n`);
  }
  return now;
}

async function acquireOne({ className, commandLabel, repoRoot, resource }) {
  const filePath = lockPath(repoRoot, resource);
  const pollMs = parsePositiveInt(process.env.FOLIOLE_RESOURCE_GATE_POLL_MS, DEFAULT_POLL_MS);
  const progressMs = parsePositiveInt(process.env.FOLIOLE_RESOURCE_GATE_PROGRESS_MS, DEFAULT_PROGRESS_MS);
  const staleMs = parsePositiveInt(process.env.FOLIOLE_RESOURCE_GATE_STALE_MS, DEFAULT_STALE_MS);
  let lastProgressAt = 0;
  while (!(await tryAcquireLock({ className, commandLabel, filePath, resource }))) {
    if (await removeStaleLock(filePath, staleMs)) {
      continue;
    }
    lastProgressAt = await printQueueProgress({ filePath, lastProgressAt, progressMs, resource });
    await delay(pollMs);
  }
  return { filePath, resource };
}

async function releaseOne(lock) {
  const current = await readLock(lock.filePath);
  if (Number(current?.pid) === process.pid) {
    await rm(lock.filePath, { force: true });
  }
}

function startHeartbeat(locks) {
  const heartbeatMs = parsePositiveInt(process.env.FOLIOLE_RESOURCE_GATE_HEARTBEAT_MS, DEFAULT_HEARTBEAT_MS);
  const timer = globalThis.setInterval(() => {
    for (const lock of locks) {
      readLock(lock.filePath)
        .then((current) => {
          if (Number(current?.pid) === process.pid) {
            return writeLock(lock.filePath, { ...current, heartbeatAt: Date.now() });
          }
          return undefined;
        })
        .catch(() => undefined);
    }
  }, heartbeatMs);
  timer.unref?.();
  return () => globalThis.clearInterval(timer);
}

function mergeHeldResources(resources, env = process.env) {
  return [...new Set([...heldResources(env), ...resources])].join(',');
}

export async function withResourceGate({ className, commandLabel = className, fn, onSignal, repoRoot }) {
  const resources = resourcesForClass(className);
  const alreadyHeld = heldResources();
  if (resources.every((resource) => alreadyHeld.has(resource))) {
    return fn(process.env);
  }

  const locks = [];
  for (const resource of resources) {
    if (!alreadyHeld.has(resource)) {
      locks.push(await acquireOne({ className, commandLabel, repoRoot, resource }));
    }
  }
  const stopHeartbeat = startHeartbeat(locks);
  const stopSignalCleanup = installSignalCleanup({ locks, onSignal, stopHeartbeat });
  const childEnv = { ...process.env, [HELD_ENV]: mergeHeldResources(resources) };
  try {
    return await fn(childEnv);
  } finally {
    stopSignalCleanup();
    stopHeartbeat();
    for (const lock of locks.toReversed()) {
      await releaseOne(lock);
    }
  }
}

function installSignalCleanup({ locks, onSignal, stopHeartbeat }) {
  let exiting = false;
  const cleanupThenExit = (code, signal) => {
    if (exiting) {
      return;
    }
    exiting = true;
    stopHeartbeat();
    Promise.resolve(onSignal?.(signal))
      .then(() => Promise.all(locks.toReversed().map((lock) => releaseOne(lock))))
      .finally(() => process.exit(code));
  };
  const onSigint = () => cleanupThenExit(130, 'SIGINT');
  const onSigterm = () => cleanupThenExit(143, 'SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  };
}

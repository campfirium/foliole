/* global process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const BARRIER_STATE_FILE = path.join(process.cwd(), '.tmp', 't4-archive-barrier', 'state.json');

const BARRIER_LOCK_FILE = path.join(path.dirname(BARRIER_STATE_FILE), 'state.lock');
const FAILED_SUPPRESSION_TTL_MS = 6 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function clearStaleLock(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function acquireLock(filePath = BARRIER_LOCK_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const startedAt = Date.now();
  for (;;) {
    try {
      return fs.openSync(filePath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      clearStaleLock(filePath);
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for T4 barrier state lock: ${filePath}`);
      }
      sleepSync(50);
    }
  }
}

function releaseLock(lock) {
  fs.closeSync(lock);
  try {
    fs.unlinkSync(BARRIER_LOCK_FILE);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function withStateLock(callback) {
  const lock = acquireLock();
  let result;
  let callbackError;
  try {
    result = callback();
  } catch (error) {
    callbackError = error;
  }
  releaseLock(lock);
  if (callbackError) throw callbackError;
  return result;
}

export function loadBarrierState(filePath = BARRIER_STATE_FILE) {
  const state = readJson(filePath, {});
  return { ...state, pending: state.pending ?? {} };
}

export function saveBarrierState(state, filePath = BARRIER_STATE_FILE) {
  writeJson(filePath, state);
}

export function isAncestorCommit(commitSha, headSha) {
  if (!commitSha || !headSha) return false;
  const result = spawnSync('git', ['merge-base', '--is-ancestor', commitSha, headSha], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0;
}

export function registerPending(commitSha, metadata = {}) {
  return withStateLock(() => {
    const state = loadBarrierState();
    state.pending[commitSha] = {
      commitSha,
      registeredAt: new Date().toISOString(),
      status: 'pending',
      ...metadata
    };
    saveBarrierState(state);
    return state.pending[commitSha];
  });
}

export function clearCoveredPending(headSha) {
  withStateLock(() => {
    const state = loadBarrierState();
    for (const [commitSha, entry] of Object.entries(state.pending)) {
      if (isAncestorCommit(commitSha, headSha)) {
        state.pending[commitSha] = { ...entry, resolvedAt: new Date().toISOString(), resolvedBy: headSha, status: 'passed' };
      }
    }
    saveBarrierState(state);
  });
}

export function markFailed(commitSha, run) {
  withStateLock(() => {
    const state = loadBarrierState();
    const current = state.pending[commitSha] ?? { commitSha, registeredAt: new Date().toISOString() };
    state.pending[commitSha] = {
      ...current,
      failedAt: new Date().toISOString(),
      runId: String(run.databaseId),
      runUrl: run.url,
      status: 'failed'
    };
    saveBarrierState(state);
  });
}

export function hasPendingBarrierForRun(run, state = loadBarrierState(), isAncestor = isAncestorCommit) {
  const now = Date.now();
  return Object.values(state.pending).some((entry) => isBarrierEntryActive(entry, now) && isAncestor(entry.commitSha, run.headSha));
}

function isBarrierEntryActive(entry, now) {
  if (entry.status === 'pending') return true;
  if (entry.status !== 'failed' || !entry.failedAt) return false;
  return now - Date.parse(entry.failedAt) < FAILED_SUPPRESSION_TTL_MS;
}

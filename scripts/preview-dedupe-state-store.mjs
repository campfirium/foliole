/* global process */

import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const LOCK_POLL_MS = 50;
const STATE_STALE_MS = 15 * 60_000;

function statePath(runtimeDir, target) {
  return path.join(runtimeDir, `${target}-preview.state.json`);
}

function lockPath(runtimeDir, target) {
  return path.join(runtimeDir, `${target}-preview.state.lock`);
}

async function readState(runtimeDir, target) {
  try {
    return JSON.parse(await readFile(statePath(runtimeDir, target), 'utf8'));
  } catch {
    return {};
  }
}

async function writeState(runtimeDir, target, state) {
  await mkdir(runtimeDir, { recursive: true });
  const finalPath = statePath(runtimeDir, target);
  const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state)}\n`, 'utf8');
  await rename(tempPath, finalPath);
}

export function isPidAlive(pid) {
  try {
    return Number.isInteger(pid) && process.kill(pid, 0);
  } catch {
    return false;
  }
}

async function tryAcquireLock(lockFile) {
  let handle = null;
  try {
    await mkdir(path.dirname(lockFile), { recursive: true });
    handle = await open(lockFile, 'wx');
    await handle.writeFile(`${JSON.stringify({ createdAt: Date.now(), pid: process.pid })}\n`);
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

async function removeStaleLock(lockFile) {
  try {
    const lock = JSON.parse(await readFile(lockFile, 'utf8'));
    if (Date.now() - Number(lock.createdAt) > STATE_STALE_MS && !isPidAlive(lock.pid)) {
      await rm(lockFile, { force: true });
    }
  } catch {
    await rm(lockFile, { force: true });
  }
}

export async function withStateLock({ fn, runtimeDir, target }) {
  const lockFile = lockPath(runtimeDir, target);
  while (!(await tryAcquireLock(lockFile))) {
    await removeStaleLock(lockFile);
    await delay(LOCK_POLL_MS);
  }
  try {
    const state = await readState(runtimeDir, target);
    const result = await fn(state);
    await writeState(runtimeDir, target, result.state ?? state);
    return result.value;
  } finally {
    await rm(lockFile, { force: true });
  }
}

import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const CLOSE_TIMEOUT_MS = 15_000;

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return true;
  return Promise.race([
    once(child, 'close').then(() => true),
    delay(timeoutMs).then(() => false)
  ]);
}

function terminate(child) {
  if (hasExited(child)) return;
  if (!child.kill('SIGTERM')) throw new Error('Windows Sync Group Electron process could not be terminated.');
}

export async function closeWindowsSyncGroupSession(session, {
  force = false, timeoutMs = CLOSE_TIMEOUT_MS
} = {}) {
  const child = session.app.process();
  if (force) {
    terminate(child);
    if (!await waitForExit(child, timeoutMs)) throw new Error('Windows Sync Group Electron process did not exit.');
    return { forced: true };
  }
  const graceful = Promise.resolve().then(() => session.app.close()).then(() => true, () => false);
  if (await Promise.race([graceful, delay(timeoutMs).then(() => false)])) return { forced: false };
  terminate(child);
  if (!await waitForExit(child, timeoutMs)) throw new Error('Windows Sync Group Electron process did not exit.');
  return { forced: true };
}

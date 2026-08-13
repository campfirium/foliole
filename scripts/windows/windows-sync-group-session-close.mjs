import { execFile } from 'node:child_process';
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

export function terminateWindowsProcessTree(child, timeoutMs, execute = execFile) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    throw new Error('Windows Sync Group Electron process did not expose a valid PID.');
  }
  return new Promise((resolve, reject) => {
    execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      timeout: timeoutMs, windowsHide: true
    }, (error) => {
      if (error && !hasExited(child)) {
        reject(new Error('Windows Sync Group Electron process tree could not be terminated.', {
          cause: error
        }));
      } else resolve();
    });
  });
}

export async function closeWindowsSyncGroupSession(session, {
  force = false, terminateTree = terminateWindowsProcessTree, timeoutMs = CLOSE_TIMEOUT_MS
} = {}) {
  const child = session.app.process();
  if (force) {
    if (!hasExited(child)) await terminateTree(child, timeoutMs);
    if (!await waitForExit(child, timeoutMs)) throw new Error('Windows Sync Group Electron process did not exit.');
    return { forced: true };
  }
  const graceful = Promise.resolve().then(() => session.app.close()).then(() => true, () => false);
  if (await Promise.race([graceful, delay(timeoutMs).then(() => false)])) return { forced: false };
  if (!hasExited(child)) await terminateTree(child, timeoutMs);
  if (!await waitForExit(child, timeoutMs)) throw new Error('Windows Sync Group Electron process did not exit.');
  return { forced: true };
}

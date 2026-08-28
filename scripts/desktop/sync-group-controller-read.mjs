import { setTimeout as delay } from 'node:timers/promises';

export async function readSyncGroupControllerState(action, { now = Date.now,
  timeoutMs = 2 * 60_000, wait = delay } = {}) {
  const deadline = now() + timeoutMs;
  let lastError;
  while (now() < deadline) {
    try { return await action(); }
    catch (error) {
      if (!String(error?.message).includes('sqlite connection is owned')) throw error;
      lastError = error;
      await wait(250);
    }
  }
  throw lastError ?? new Error('Sync Group controller read timed out.');
}

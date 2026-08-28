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

export async function waitForSyncGroupAutomaticRun(action, previousRunId, {
  now = Date.now, timeoutMs = 3 * 60_000, wait = delay
} = {}) {
  const deadline = now() + timeoutMs;
  let result;
  while (now() < deadline) {
    result = await readSyncGroupControllerState(action, { now, timeoutMs, wait });
    if (result?.run_id !== previousRunId && result?.reason === 'automatic'
        && result?.status === 'completed') return result;
    await wait(250);
  }
  throw new Error(`Automatic Sync Group run did not complete: ${JSON.stringify(result)}`);
}

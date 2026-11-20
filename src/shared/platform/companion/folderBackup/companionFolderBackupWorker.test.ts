import { afterEach, expect, it, vi } from 'vitest';

import { CompanionFolderBackupWorker } from './companionFolderBackupWorker';

afterEach(() => { vi.useRealTimers(); });

it('waits for an in-flight file before closing and refuses another claim', async () => {
  vi.useFakeTimers();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let canContinue: (() => boolean) | undefined;
  const run = vi.fn(async (next: () => boolean) => {
    canContinue = next;
    await pending;
    return { errorMessage: null };
  });
  const worker = new CompanionFolderBackupWorker(true, { run, saveEnabled: async () => {} });
  worker.wake();
  await vi.advanceTimersByTimeAsync(150);
  expect(run).toHaveBeenCalledTimes(1);
  worker.wake();
  let stopped = false;
  const closing = (async () => { await worker.stop(); stopped = true; })();
  try {
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(canContinue?.()).toBe(false);
    release();
    await closing;
    worker.wake(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(stopped).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  } finally { release(); await closing; }
});

function countingWorker() {
  const run = vi.fn(async () => ({ errorMessage: null }));
  return { run, worker: new CompanionFolderBackupWorker(true, { run, saveEnabled: async () => {} }) };
}

it('coalesces a burst of commits into one round after they pause', async () => {
  vi.useFakeTimers();
  const { run, worker } = countingWorker();
  for (let i = 0; i < 20; i++) { worker.wake(true, true); await vi.advanceTimersByTimeAsync(1_000); }
  expect(run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(run).toHaveBeenCalledTimes(1);
});

it('still backs up periodically while commits never pause', async () => {
  vi.useFakeTimers();
  const { run, worker } = countingWorker();
  for (let i = 0; i < 150; i++) { worker.wake(true, true); await vi.advanceTimersByTimeAsync(1_000); }
  expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(run.mock.calls.length).toBeLessThanOrEqual(3);
});

it('starts a coalesced round at once on flush and never postpones a prompt request', async () => {
  vi.useFakeTimers();
  const { run, worker } = countingWorker();
  worker.flush();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(run).not.toHaveBeenCalled();
  worker.wake(true, true);
  worker.flush();
  await vi.advanceTimersByTimeAsync(150);
  expect(run).toHaveBeenCalledTimes(1);
  worker.wake(true);
  worker.wake(true, true);
  await vi.advanceTimersByTimeAsync(150);
  expect(run).toHaveBeenCalledTimes(2);
});

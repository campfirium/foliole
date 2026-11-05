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

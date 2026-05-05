// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createManagedInboxMonitor } from './managedInboxMonitor.js';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

it('starts with an immediate import and reconfigures when the inbox path changes', async () => {
  const close = vi.fn();
  const watch = vi.fn(() => ({ close }));
  const ensureRoot = vi.fn().mockResolvedValue(undefined);
  const runImport = vi.fn().mockResolvedValue(undefined);
  const loadConfiguredRootPath = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce('/tmp/inbox-a')
    .mockResolvedValueOnce('/tmp/inbox-b');
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot,
    loadConfiguredRootPath,
    logError: vi.fn(),
    runImport,
    watch
  });

  await monitor.start();
  await monitor.refreshFromSettings();

  expect(ensureRoot).toHaveBeenNthCalledWith(1, '/tmp/inbox-a');
  expect(watch).toHaveBeenNthCalledWith(1, '/tmp/inbox-a', expect.any(Function));
  expect(runImport).toHaveBeenNthCalledWith(1, '/tmp/inbox-a');
  expect(close).toHaveBeenCalledTimes(1);
  expect(ensureRoot).toHaveBeenNthCalledWith(2, '/tmp/inbox-b');
  expect(watch).toHaveBeenNthCalledWith(2, '/tmp/inbox-b', expect.any(Function));
  expect(runImport).toHaveBeenNthCalledWith(2, '/tmp/inbox-b');
});

it('coalesces watch bursts into a follow-up import after the current run finishes', async () => {
  const deferred = createDeferred();
  const watchCallbacks: Array<() => void> = [];
  const runImport = vi
    .fn()
    .mockImplementationOnce(() => deferred.promise)
    .mockResolvedValueOnce(undefined);
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot: vi.fn().mockResolvedValue(undefined),
    loadConfiguredRootPath: vi.fn().mockResolvedValue('/tmp/inbox'),
    logError: vi.fn(),
    runImport,
    watch: vi.fn((_rootPath, listener) => {
      watchCallbacks.push(listener);
      return { close: vi.fn() };
    })
  });

  const startPromise = monitor.start();
  await vi.waitFor(() => {
    expect(runImport).toHaveBeenCalledTimes(1);
  });
  watchCallbacks[0]?.();
  watchCallbacks[0]?.();
  deferred.resolve();
  await startPromise;
  await vi.waitFor(() => {
    expect(runImport).toHaveBeenCalledTimes(2);
  });

  expect(watchCallbacks).toHaveLength(1);
});

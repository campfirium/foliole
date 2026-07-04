// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createManagedInboxMonitor } from './managedInboxMonitor.js';
import { createManagedInboxImportEntry, createManagedInboxImportResult } from './managedInboxMonitor.testSupport.js';

function createDeferred() {
  let resolve!: (value: ReturnType<typeof createManagedInboxImportResult>) => void;
  const promise = new Promise<ReturnType<typeof createManagedInboxImportResult>>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

it('starts with an immediate import and reconfigures when the inbox path changes', async () => {
  const close = vi.fn();
  const watch = vi.fn(() => ({ close }));
  const ensureRoot = vi.fn().mockResolvedValue(undefined);
  const notifyUpdate = vi.fn();
  const runImport = vi.fn().mockResolvedValue(undefined);
  runImport.mockResolvedValue(createManagedInboxImportResult({ root_path: '/tmp/inbox-a' }));
  const loadConfiguredRootPath = vi
    .fn<() => Promise<Array<{ rootPath: string }>>>()
    .mockResolvedValueOnce([{ rootPath: '/tmp/inbox-a' }])
    .mockResolvedValueOnce([{ rootPath: '/tmp/inbox-b' }]);
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot,
    loadConfiguredRootPaths: loadConfiguredRootPath,
    logError: vi.fn(),
    notifyUpdate,
    runImport,
    watch
  });

  await monitor.start();
  await monitor.refreshFromSettings();

  expect(ensureRoot).toHaveBeenNthCalledWith(1, '/tmp/inbox-a');
  expect(watch).toHaveBeenNthCalledWith(1, '/tmp/inbox-a', expect.any(Function));
  expect(runImport).toHaveBeenNthCalledWith(1, '/tmp/inbox-a', undefined);
  expect(close).toHaveBeenCalledTimes(1);
  expect(ensureRoot).toHaveBeenNthCalledWith(2, '/tmp/inbox-b');
  expect(watch).toHaveBeenNthCalledWith(2, '/tmp/inbox-b', expect.any(Function));
  expect(runImport).toHaveBeenNthCalledWith(2, '/tmp/inbox-b', undefined);
  expect(notifyUpdate.mock.calls[0]?.[0]).toBe('import-a');
  expect(notifyUpdate.mock.calls[1]?.[0]).toBe('import-a');
});

it('does not notify the renderer when a managed inbox cycle has no imported nodes', async () => {
  const notifyUpdate = vi.fn();
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot: vi.fn().mockResolvedValue(undefined),
    loadConfiguredRootPaths: vi.fn().mockResolvedValue([{ rootPath: '/tmp/inbox' }]),
    logError: vi.fn(),
    notifyUpdate,
    runImport: vi.fn().mockResolvedValue(createManagedInboxImportResult({
      entries: [createManagedInboxImportEntry({
        content_fingerprint: 'content-failed',
        failure_reason: 'Unsupported source',
        import_id: 'import-failed',
        node_id: null,
        result_status: 'failed'
      })]
    })),
    watch: vi.fn(() => ({ close: vi.fn() }))
  });

  await monitor.start();

  expect(notifyUpdate).not.toHaveBeenCalled();
});

it('does not notify the renderer when a managed inbox cycle only finds duplicates', async () => {
  const notifyUpdate = vi.fn();
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot: vi.fn().mockResolvedValue(undefined),
    loadConfiguredRootPaths: vi.fn().mockResolvedValue([{ rootPath: '/tmp/inbox' }]),
    logError: vi.fn(),
    notifyUpdate,
    runImport: vi.fn().mockResolvedValue(createManagedInboxImportResult({
      entries: [createManagedInboxImportEntry({
        duplicate_semantic: 'duplicate',
        import_id: 'import-duplicate'
      })]
    })),
    watch: vi.fn(() => ({ close: vi.fn() }))
  });

  await monitor.start();

  expect(notifyUpdate).not.toHaveBeenCalled();
});

it('coalesces watch bursts into a follow-up import after the current run finishes', async () => {
  const deferred = createDeferred();
  const watchCallbacks: Array<() => void> = [];
  const runImport = vi
    .fn()
    .mockImplementationOnce(() => deferred.promise)
    .mockResolvedValueOnce(createManagedInboxImportResult({ entries: [] }));
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot: vi.fn().mockResolvedValue(undefined),
    loadConfiguredRootPaths: vi.fn().mockResolvedValue([{ rootPath: '/tmp/inbox' }]),
    logError: vi.fn(),
    notifyUpdate: vi.fn(),
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
  deferred.resolve(createManagedInboxImportResult({ entries: [] }));
  await startPromise;
  await vi.waitFor(() => {
    expect(runImport).toHaveBeenCalledTimes(2);
  });

  expect(watchCallbacks).toHaveLength(1);
});

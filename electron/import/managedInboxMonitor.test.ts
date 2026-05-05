// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { createManagedInboxMonitor } from './managedInboxMonitor.js';

function createDeferred() {
  let resolve!: (value: {
    archive_root_path: null;
    consume_policy: 'clear';
    consumed_count: number;
    discovered_count: number;
    entries: [];
    failed_count: number;
    imported_count: number;
    root_path: string;
    source_adapter: 'foliole_managed_inbox_folder';
  }) => void;
  const promise = new Promise<{
    archive_root_path: null;
    consume_policy: 'clear';
    consumed_count: number;
    discovered_count: number;
    entries: [];
    failed_count: number;
    imported_count: number;
    root_path: string;
    source_adapter: 'foliole_managed_inbox_folder';
  }>((nextResolve) => {
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
  runImport.mockResolvedValue({
    archive_root_path: null,
    consume_policy: 'clear',
    consumed_count: 0,
    discovered_count: 1,
    entries: [
      {
        adapter: 'markdown_directory',
        content_fingerprint: 'content-1',
        degraded_reason: null,
        duplicate_semantic: 'new',
        failure_reason: null,
        import_id: 'import-a',
        imported_at: '2026-03-25T00:00:00.000Z',
        node_id: 'node-a',
        provider: 'desktop_text_file',
        result_status: 'imported',
        source_fingerprint: 'source-1',
        source_kind: 'markdown',
        source_locator: '/tmp/inbox-a/a.md',
        source_name: 'a.md'
      }
    ],
    failed_count: 0,
    imported_count: 1,
    root_path: '/tmp/inbox-a',
    source_adapter: 'foliole_managed_inbox_folder'
  });
  const loadConfiguredRootPath = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce('/tmp/inbox-a')
    .mockResolvedValueOnce('/tmp/inbox-b');
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot,
    loadConfiguredRootPath,
    logError: vi.fn(),
    notifyUpdate,
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
  expect(notifyUpdate).toHaveBeenNthCalledWith(1, 'import-a');
  expect(notifyUpdate).toHaveBeenNthCalledWith(2, 'import-a');
});

it('coalesces watch bursts into a follow-up import after the current run finishes', async () => {
  const deferred = createDeferred();
  const watchCallbacks: Array<() => void> = [];
  const runImport = vi
    .fn()
    .mockImplementationOnce(() => deferred.promise)
    .mockResolvedValueOnce({
      archive_root_path: null,
      consume_policy: 'clear',
      consumed_count: 0,
      discovered_count: 0,
      entries: [],
      failed_count: 0,
      imported_count: 0,
      root_path: '/tmp/inbox',
      source_adapter: 'foliole_managed_inbox_folder'
    });
  const monitor = createManagedInboxMonitor({
    debounceMs: 0,
    ensureRoot: vi.fn().mockResolvedValue(undefined),
    loadConfiguredRootPath: vi.fn().mockResolvedValue('/tmp/inbox'),
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
  deferred.resolve({
    archive_root_path: null,
    consume_policy: 'clear',
    consumed_count: 0,
    discovered_count: 0,
    entries: [],
    failed_count: 0,
    imported_count: 0,
    root_path: '/tmp/inbox',
    source_adapter: 'foliole_managed_inbox_folder'
  });
  await startPromise;
  await vi.waitFor(() => {
    expect(runImport).toHaveBeenCalledTimes(2);
  });

  expect(watchCallbacks).toHaveLength(1);
});

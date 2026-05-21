import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { runRuntimeTextFileImport } from './importExecutionRuntimeRepository';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

it('passes selected EPUB path and release mode to the native import command', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-epub',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-epub',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'epub',
    source_locator: '/tmp/book.epub',
    source_name: 'book.epub'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(
    runRuntimeTextFileImport(undefined, undefined, {
      filePath: '/tmp/book.epub',
      sequentialReadingMode: 'sequential'
    })
  ).resolves.toMatchObject({
    importId: 'import-epub',
    sourceKind: 'epub'
  });
  expect(invoke).toHaveBeenCalledWith('run_text_file_import', {
    file_path: '/tmp/book.epub',
    sequential_reading_mode: 'sequential'
  });
});

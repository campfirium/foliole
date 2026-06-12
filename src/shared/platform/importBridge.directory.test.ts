import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { runRuntimeDirectoryImport } from './importExecutionRuntimeRepository';

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

it('normalizes the directory import payload', async () => {
  const invoke = vi.fn().mockResolvedValue({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 1,
    entries: [
      {
        adapter: 'markdown_directory',
        content_fingerprint: 'content-fingerprint',
        degraded_reason: null,
        duplicate_semantic: 'new',
        failure_reason: null,
        import_id: 'import-dir-1',
        imported_at: '2026-03-22T10:00:00.000Z',
        node_id: 'node-1',
        provider: 'desktop_text_file',
        result_status: 'imported',
        source_fingerprint: 'source-fingerprint',
        source_kind: 'markdown',
        source_locator: '/tmp/library/note.md',
        source_name: 'note.md'
      }
    ],
    failed_count: 0,
    imported_count: 1,
    root_path: '/tmp/library',
    source_adapter: 'external_directory'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(runRuntimeDirectoryImport()).resolves.toEqual({
    archiveRootPath: null,
    consumePolicy: 'keep',
    consumedCount: 0,
    discoveredCount: 1,
    entries: [
      {
        adapter: 'markdown_directory',
        contentFingerprint: 'content-fingerprint',
        degradedReason: null,
        duplicateSemantic: 'new',
        failureReason: null,
        importId: 'import-dir-1',
        importedAt: '2026-03-22T10:00:00.000Z',
        nodeId: 'node-1',
        nodeMutationPatch: null,
        provider: 'desktop_text_file',
        resultStatus: 'imported',
        sourceFingerprint: 'source-fingerprint',
        sourceKind: 'markdown',
        sourceLocator: '/tmp/library/note.md',
        sourceName: 'note.md'
      }
    ],
    failedCount: 0,
    importedCount: 1,
    nodeMutationPatch: null,
    rootPath: '/tmp/library',
    sourceAdapter: 'external_directory'
  });
  expect(invoke).toHaveBeenCalledWith('run_directory_import', {});
});

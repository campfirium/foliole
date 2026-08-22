import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { selectRuntimeFolder } from './folderSelectionRuntimeRepository';
import { selectRuntimeImportDirectory } from './importDirectoryRuntimeRepository';
import { runRuntimeTextFileImport, selectRuntimeImportTextFile } from './importExecutionRuntimeRepository';
import { loadRuntimeImportOverview } from './importOverviewRuntimeRepository';
const IMPORT_OVERVIEW_PAYLOAD = {
  latest_failure: {
    content_fingerprint: 'content-failure',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: 'disk failed',
    import_id: 'import-2',
    imported_at: '2026-03-22T11:00:00.000Z',
    node_id: null,
    provider: 'desktop_text_file',
    result_status: 'failed',
    source_fingerprint: 'source-fingerprint-2',
    source_kind: 'markdown',
    source_locator: '/tmp/failure.md',
    source_name: 'failure.md'
  },
  latest_result: {
    content_fingerprint: 'content-success',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  recent_runs: [
    {
      content_fingerprint: 'content-success',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      import_id: 'import-1',
      imported_at: '2026-03-22T10:00:00.000Z',
      node_id: 'node-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-fingerprint-1',
      source_kind: 'markdown',
      source_locator: '/tmp/note.md',
      source_name: 'note.md'
    }
  ]
};

const IMPORT_OVERVIEW_RESULT = {
  latestFailure: {
    contentFingerprint: 'content-failure',
    degradedReason: null,
    duplicateSemantic: 'new' as const,
    failureReason: 'disk failed',
    importId: 'import-2',
    importedAt: '2026-03-22T11:00:00.000Z',
    nodeId: null,
    nodeMutationPatch: null,
    provider: 'desktop_text_file' as const,
    resultStatus: 'failed' as const,
    sourceFingerprint: 'source-fingerprint-2',
    sourceKind: 'markdown' as const,
    sourceLocator: '/tmp/failure.md',
    sourceName: 'failure.md'
  },
  latestResult: {
    contentFingerprint: 'content-success',
    degradedReason: null,
    duplicateSemantic: 'new' as const,
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-03-22T10:00:00.000Z',
    nodeId: 'node-1',
    nodeMutationPatch: null,
    provider: 'desktop_text_file' as const,
    resultStatus: 'imported' as const,
    sourceFingerprint: 'source-fingerprint-1',
    sourceKind: 'markdown' as const,
    sourceLocator: '/tmp/note.md',
    sourceName: 'note.md'
  },
  recentRuns: [
    {
      contentFingerprint: 'content-success',
      degradedReason: null,
      duplicateSemantic: 'new' as const,
      failureReason: null,
      importId: 'import-1',
      importedAt: '2026-03-22T10:00:00.000Z',
      nodeId: 'node-1',
      nodeMutationPatch: null,
      provider: 'desktop_text_file' as const,
      resultStatus: 'imported' as const,
      sourceFingerprint: 'source-fingerprint-1',
      sourceKind: 'markdown' as const,
      sourceLocator: '/tmp/note.md',
      sourceName: 'note.md'
    }
  ]
};

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
it('normalizes the native import file payload', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content: '# Imported',
    file_name: 'note.md',
    file_path: '/tmp/note.md',
    kind: 'markdown'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(selectRuntimeImportTextFile()).resolves.toEqual({
    content: '# Imported',
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    kind: 'markdown'
  });
  expect(invoke).toHaveBeenCalledWith('select_import_text_file', {});
});
it('returns the selected folder path from the runtime bridge', async () => {
  const invoke = vi.fn().mockResolvedValue('/tmp/import-folder');
  window.electronAPI = createMockElectronApi(invoke);

  await expect(selectRuntimeFolder('/tmp/current-folder')).resolves.toBe('/tmp/import-folder');
  expect(invoke).toHaveBeenCalledWith('select_import_directory', { default_path: '/tmp/current-folder' });
});
it('keeps the import directory wrapper on the shared import bridge', async () => {
  const invoke = vi.fn().mockResolvedValue('/tmp/import-folder');
  window.electronAPI = createMockElectronApi(invoke);

  await expect(selectRuntimeImportDirectory()).resolves.toBe('/tmp/import-folder');
  expect(invoke).toHaveBeenCalledWith('select_import_directory', {});
});
it('normalizes the unified import result payload', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'updated',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(runRuntimeTextFileImport()).resolves.toEqual({
    contentFingerprint: 'content-fingerprint',
    degradedReason: null,
    duplicateSemantic: 'updated',
    failureReason: null,
    importId: 'import-1',
    importedAt: '2026-03-22T10:00:00.000Z',
    nodeId: 'node-1',
    nodeMutationPatch: null,
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/note.md',
    sourceName: 'note.md'
  });
  expect(invoke).toHaveBeenCalledWith('run_text_file_import', {});
});
it('accepts html import payloads from the runtime bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content_fingerprint: 'content-fingerprint-html',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-html-1',
    imported_at: '2026-03-22T10:30:00.000Z',
    node_id: 'node-html-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint-html',
    source_kind: 'html',
    source_locator: '/tmp/note.html',
    source_name: 'note.html'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(runRuntimeTextFileImport()).resolves.toEqual({
    contentFingerprint: 'content-fingerprint-html',
    degradedReason: null,
    duplicateSemantic: 'new',
    failureReason: null,
    importId: 'import-html-1',
    importedAt: '2026-03-22T10:30:00.000Z',
    nodeId: 'node-html-1',
    nodeMutationPatch: null,
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint-html',
    sourceKind: 'html',
    sourceLocator: '/tmp/note.html',
    sourceName: 'note.html'
  });
});

it('forwards highlight policy configuration to the runtime import bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    content_fingerprint: 'content-fingerprint',
    degraded_reason: null,
    duplicate_semantic: 'new',
    failure_reason: null,
    import_id: 'import-1',
    imported_at: '2026-03-22T10:00:00.000Z',
    node_id: 'node-1',
    provider: 'desktop_text_file',
    result_status: 'imported',
    source_fingerprint: 'source-fingerprint',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  });
  window.electronAPI = createMockElectronApi(invoke);
  await runRuntimeTextFileImport('adopt');
  expect(invoke).toHaveBeenCalledWith('run_text_file_import', { highlight_policy: 'adopt' });
});

it('returns null when the native import payload is malformed', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({ file_name: 'note.md' });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(selectRuntimeImportTextFile()).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native import file payload invalid',
    expect.objectContaining({
      action: 'select_runtime_import_text_file',
      area: 'bridge',
      command: 'select_import_text_file',
      fallback: 'return_null'
    })
  );
});

it('normalizes the persisted import overview payload', async () => {
  const invoke = vi.fn().mockResolvedValue(IMPORT_OVERVIEW_PAYLOAD);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeImportOverview()).resolves.toEqual(IMPORT_OVERVIEW_RESULT);
  expect(invoke).toHaveBeenCalledWith('load_import_overview');
});

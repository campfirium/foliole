import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { runRuntimeTextFileImport, selectRuntimeImportTextFile } from './importBridge';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
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
  expect(invoke).toHaveBeenCalledWith('select_import_text_file');
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
    provider: 'desktop_text_file',
    resultStatus: 'imported',
    sourceFingerprint: 'source-fingerprint',
    sourceKind: 'markdown',
    sourceLocator: '/tmp/note.md',
    sourceName: 'note.md'
  });
  expect(invoke).toHaveBeenCalledWith('run_text_file_import');
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

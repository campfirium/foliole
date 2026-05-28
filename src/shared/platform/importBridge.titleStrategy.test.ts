import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { runRuntimeClipboardImport, runRuntimeDirectoryImport, runRuntimeTextFileImport } from './importExecutionRuntimeRepository';

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

it('forwards title strategy configuration to the text import bridge', async () => {
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

  await runRuntimeTextFileImport(undefined, 'heading');

  expect(invoke).toHaveBeenCalledWith('run_text_file_import', { title_strategy: 'heading' });
});

it('forwards title strategy to directory imports', async () => {
  const invoke = vi.fn().mockResolvedValue({
    archive_root_path: null,
    consume_policy: 'keep',
    consumed_count: 0,
    discovered_count: 0,
    entries: [],
    failed_count: 0,
    imported_count: 0,
    root_path: '/tmp/library',
    source_adapter: 'external_directory'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await runRuntimeDirectoryImport('heading');

  expect(invoke).toHaveBeenCalledWith('run_directory_import', { title_strategy: 'heading' });
});

it('forwards target parent configuration to clipboard imports', async () => {
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
    source_kind: 'text',
    source_locator: 'clipboard://text/2026-03-22T10:00:00.000Z',
    source_name: 'Clipboard Text.txt'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await runRuntimeClipboardImport(undefined, undefined, { targetParentNodeId: 'node-target' });

  expect(invoke).toHaveBeenCalledWith('run_clipboard_import', { target_parent_node_id: 'node-target' });
});

import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { previewRuntimeKeepImportRule } from './keepImportPreviewRuntimeRepository';

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

it('forwards keep preview mode details to the runtime import bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    blocked_count: 0,
    discovered_count: 1,
    entries: [{ detail: 'New file will be imported when enabled.', source_path: 'note.md', status: 'new' }],
    failed_count: 0,
    new_count: 1,
    previewed_at: '2026-03-28T08:00:00.000Z',
    root_path: '/tmp/inbox',
    unchanged_count: 0,
    updated_count: 0
  });
  window.electronAPI = createMockElectronApi(invoke);

  await previewRuntimeKeepImportRule({
    directoryPath: '/tmp/inbox',
    highlightMode: 'merged',
    highlightPolicy: 'adopt',
    ruleId: 'draft-import-source-101',
    sourceType: 'generic'
  });

  expect(invoke).toHaveBeenCalledWith('preview_keep_import_rule', {
    directory_path: '/tmp/inbox',
    highlight_mode: 'merged',
    highlight_policy: 'adopt',
    rule_id: 'draft-import-source-101',
    source_type: 'generic'
  });
});

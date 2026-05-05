import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { selectRuntimeImportTextFile } from './importBridge';

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

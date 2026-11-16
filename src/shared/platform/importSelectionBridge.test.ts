import { afterEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { selectRuntimeImportTextFile } from './importExecutionRuntimeRepository';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

afterEach(() => { delete window.electronAPI; });

const files = ['first', 'second'].map((name) => ({
  content: '', file_name: `${name}.md`, file_path: `/tmp/${name}.md`, kind: 'markdown'
}));

it('keeps all selected paths across the native bridge', async () => {
  window.electronAPI = createMockElectronApi(vi.fn().mockResolvedValue(files));
  await expect(selectRuntimeImportTextFile()).resolves.toEqual(files.map((file) => ({
    content: '', fileName: file.file_name, filePath: file.file_path, kind: 'markdown'
  })));
});

it.each([[], [files[0], {}], {}, null])('does not partially accept an invalid selection: %j', async (payload) => {
  window.electronAPI = createMockElectronApi(vi.fn().mockResolvedValue(payload));
  await expect(selectRuntimeImportTextFile()).resolves.toBeNull();
});

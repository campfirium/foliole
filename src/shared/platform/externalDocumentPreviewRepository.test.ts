import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import { loadExternalDocumentPreview } from './externalDocumentPreviewRepository';

function createNativePreview() {
  return {
    absolute_path: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    file_name: 'topic.md',
    folder_id: 'folder-1',
    folder_path: '/library',
    relative_path: 'topic.md'
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
});

it('loads external document previews through the native external search command', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.loadExternalSearchPreview ? createNativePreview() : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const result = await loadExternalDocumentPreview('/library/topic.md');

  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.loadExternalSearchPreview, {
    absolute_path: '/library/topic.md'
  });
  expect(result).toEqual({
    absolutePath: '/library/topic.md',
    content: '# Topic',
    extension: 'md',
    fileName: 'topic.md',
    folderId: 'folder-1',
    folderPath: '/library',
    relativePath: 'topic.md'
  });
});

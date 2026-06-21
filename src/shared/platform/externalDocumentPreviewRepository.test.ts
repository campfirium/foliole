import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import { loadExternalDocumentPreview } from './externalDocumentPreviewRepository';
import { resetExternalFolderRuntimeProviderForTest } from './externalFolderRuntime';

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
  resetExternalFolderRuntimeProviderForTest();
  delete window.electronAPI;
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
    editable: undefined,
    extension: 'md',
    fileName: 'topic.md',
    fileSize: null,
    folderId: 'folder-1',
    folderPath: '/library',
    importedNodeId: null,
    isPresent: undefined,
    lastOpenedAt: null,
    modifiedAt: null,
    sourceKind: undefined,
    relativePath: 'topic.md'
  });
});

it('passes local file source context to external preview loading', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.loadExternalSearchPreview ? createNativePreview() : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await loadExternalDocumentPreview('/library/topic.md', {
    folderId: 'opened-external-documents',
    sourceKind: 'local_file'
  });

  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.loadExternalSearchPreview, {
    absolute_path: '/library/topic.md',
    folder_id: 'opened-external-documents',
    source_kind: 'local_file'
  });
});

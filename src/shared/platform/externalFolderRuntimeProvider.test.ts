import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeTextImportResult } from '../../../lib/platform/nativeImportContract';

import { importExternalDocument } from './externalDocumentImportRepository';
import { loadExternalDocumentPreview } from './externalDocumentPreviewRepository';
import {
  loadExternalLibraryBrowseEntries,
  loadExternalLibraryFolders,
  rebuildExternalLibraryIndex,
  subscribeExternalLibraryFolders
} from './externalLibraryBrowseRepository';
import {
  loadExternalSourceSettingsFolders,
  rebuildExternalSourceSettingsIndex,
  resetExternalSourceSettingsFoldersCacheForTest,
  saveExternalSourceSettingsFolders,
  selectExternalSourceSettingsFolderPath,
  type ExternalSourceSettingsFolder
} from './externalSourceSettingsRepository';
import {
  installExternalFolderRuntimeProvider,
  resetExternalFolderRuntimeProviderForTest,
  type ExternalFolderRuntimeProvider
} from './runtime/externalFolderRuntime';

const folder = createFolder();
const browseEntry = {
  absolutePath: 'demo-external://folder-ext/topic.md',
  editable: false,
  extension: 'md',
  fileName: 'topic.md',
  fileSize: 7,
  folderId: folder.id,
  folderPath: folder.folderPath,
  importedNodeId: null,
  isPresent: true,
  lastOpenedAt: null,
  modifiedAt: '2026-06-20T00:00:00.000Z',
  openingText: null,
  relativePath: 'topic.md',
  sourceKind: 'external_document',
  title: 'topic'
} as const;
const importResult: NativeTextImportResult = {
  content_fingerprint: 'content',
  degraded_reason: null,
  duplicate_semantic: 'new',
  failure_reason: null,
  import_id: 'import-1',
  imported_at: '2026-06-20T00:00:00.000Z',
  node_id: 'node-1',
  provider: 'desktop_text_file',
  result_status: 'imported',
  source_fingerprint: 'source',
  source_kind: 'markdown',
  source_locator: browseEntry.absolutePath,
  source_name: browseEntry.fileName
};

beforeEach(() => {
  vi.restoreAllMocks();
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
  delete window.electronAPI;
});

it('lets an installed external folder provider handle shared repository calls', async () => {
  const listener = vi.fn();
  const unsubscribe = vi.fn();
  const provider = createProvider();
  installExternalFolderRuntimeProvider(provider);

  expect(await loadExternalLibraryFolders()).toEqual([folder]);
  expect(await loadExternalSourceSettingsFolders()).toEqual([folder]);
  expect(await loadExternalLibraryBrowseEntries(folder.id)).toEqual([browseEntry]);
  expect(await loadExternalDocumentPreview(browseEntry.absolutePath)).toMatchObject({
    absolutePath: browseEntry.absolutePath,
    content: '# Topic',
    folderId: folder.id
  });
  expect(await importExternalDocument(browseEntry.absolutePath)).toEqual(importResult);
  expect(await rebuildExternalLibraryIndex(folder.id)).toEqual([folder]);
  expect(await rebuildExternalSourceSettingsIndex(folder.id)).toEqual([folder]);
  expect(await saveExternalSourceSettingsFolders([folder])).toEqual([folder]);
  expect(await selectExternalSourceSettingsFolderPath()).toBe('Samples');

  const stop = subscribeExternalLibraryFolders(listener);
  provider.subscribeFolders.mock.calls[0]?.[0]([folder]);
  stop();

  expect(listener).toHaveBeenCalledWith([folder]);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(provider.loadBrowseEntries).toHaveBeenCalledWith(folder.id);
  expect(provider.loadPreview).toHaveBeenCalledWith(browseEntry.absolutePath, {});
  expect(provider.importDocument).toHaveBeenCalledWith(browseEntry.absolutePath);
  expect(provider.rebuildIndex).toHaveBeenCalledWith(folder.id);
  expect(provider.saveFolders).toHaveBeenCalledWith([folder]);

  function createProvider() {
    return {
      importDocument: vi.fn(async () => importResult),
      loadBrowseEntries: vi.fn(async () => [browseEntry]),
      loadFolders: vi.fn(async () => [folder]),
      loadPreview: vi.fn(async () => ({
        ...browseEntry,
        content: '# Topic'
      })),
      rebuildIndex: vi.fn(async () => [folder]),
      saveFolders: vi.fn(async () => [folder]),
      selectFolderPath: vi.fn(async () => 'Samples'),
      subscribeFolders: vi.fn(() => unsubscribe)
    } satisfies ExternalFolderRuntimeProvider;
  }
});

function createFolder(): ExternalSourceSettingsFolder {
  return {
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: '2026-06-20T00:00:00.000Z',
    documentCount: 1,
    excludedDirs: [],
    folderPath: 'Samples',
    id: 'folder-ext',
    indexedAt: '2026-06-20T00:00:00.000Z',
    lastError: null,
    status: 'ready',
    updatedAt: '2026-06-20T00:00:00.000Z'
  };
}

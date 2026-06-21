import { beforeEach, expect, it, vi } from 'vitest';

import {
  resetExternalSourceSettingsFoldersCacheForTest,
  type ExternalSourceSettingsFolder
} from '../../shared/platform/externalSourceSettingsRepository';
import {
  installExternalFolderRuntimeProvider,
  resetExternalFolderRuntimeProviderForTest,
  type ExternalFolderRuntimeProvider
} from '../../shared/platform/runtime/externalFolderRuntime';

import { connectExternalFolder } from './externalFolderConnection';

function externalFolder(args: { folderPath: string; id: string }): ExternalSourceSettingsFolder {
  return {
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    createdAt: '2026-06-21T00:00:00.000Z',
    documentCount: 0,
    excludedDirs: [],
    folderPath: args.folderPath,
    id: args.id,
    indexedAt: null,
    lastError: null,
    status: 'idle',
    updatedAt: '2026-06-21T00:00:00.000Z'
  };
}

beforeEach(() => {
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
});

it('saves a selected external folder and returns the folder to open', async () => {
  const saveFolders = vi.fn(async (folders: ExternalSourceSettingsFolder[]) => folders);
  const rebuildIndex = vi.fn(async () => [externalFolder({ folderPath: 'Docs', id: 'saved-folder' })]);
  installExternalFolderRuntimeProvider(createProvider({
    rebuildIndex,
    saveFolders,
    selectFolderPath: vi.fn(async () => 'Docs')
  }));

  await expect(connectExternalFolder([])).resolves.toEqual({
    folderId: 'saved-folder',
    folders: [expect.objectContaining({ folderPath: 'Docs', id: 'saved-folder' })]
  });
  expect(saveFolders).toHaveBeenCalledWith([expect.objectContaining({ folderPath: 'Docs' })]);
  expect(rebuildIndex).toHaveBeenCalledTimes(1);
});

it('opens an already connected external folder without saving a duplicate', async () => {
  const currentFolder = externalFolder({ folderPath: 'Docs', id: 'existing-folder' });
  const saveFolders = vi.fn();
  installExternalFolderRuntimeProvider(createProvider({
    saveFolders,
    selectFolderPath: vi.fn(async () => 'Docs')
  }));

  await expect(connectExternalFolder([currentFolder])).resolves.toEqual({
    folderId: 'existing-folder',
    folders: [currentFolder]
  });
  expect(saveFolders).not.toHaveBeenCalled();
});

function createProvider(overrides: Partial<ExternalFolderRuntimeProvider>): ExternalFolderRuntimeProvider {
  return {
    importDocument: () => Promise.resolve(null),
    loadBrowseEntries: () => Promise.resolve(null),
    loadFolders: () => Promise.resolve(null),
    loadPreview: () => Promise.resolve(null),
    rebuildIndex: () => Promise.resolve(null),
    saveFolders: () => Promise.resolve(null),
    selectFolderPath: () => Promise.resolve(null),
    subscribeFolders: () => () => undefined,
    ...overrides
  };
}

import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import {
  createDraftExternalSourceFolder,
  loadExternalSourceSettingsFolders,
  rebuildExternalSourceSettingsIndex,
  resetExternalSourceSettingsFoldersCacheForTest,
  saveExternalSourceSettingsFolders,
  selectExternalSourceSettingsFolderPath,
  type ExternalSourceSettingsFolder
} from './externalSourceSettingsRepository';
import { resetExternalFolderRuntimeProviderForTest } from './runtime/externalFolderRuntime';

function createExternalSourceFolder(): ExternalSourceSettingsFolder {
  return {
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: '/attachments',
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 1,
    excludedDirs: ['tmp'],
    folderPath: '/library',
    id: 'folder-ext',
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    status: 'ready',
    updatedAt: '2026-04-21T00:00:00.000Z'
  };
}

function createNativeFolder() {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: '/attachments',
    created_at: '2026-04-21T00:00:00.000Z',
    document_count: 1,
    excluded_dirs: ['tmp'],
    folder_path: '/library',
    id: 'folder-ext',
    indexed_at: '2026-04-21T00:00:00.000Z',
    last_error: null,
    status: 'ready',
    updated_at: '2026-04-21T00:00:00.000Z'
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetExternalFolderRuntimeProviderForTest();
  resetExternalSourceSettingsFoldersCacheForTest();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  delete window.electronAPI;
});

it('creates external source folder drafts with the persisted settings shape', () => {
  const draft = createDraftExternalSourceFolder('/library');

  expect(draft).toMatchObject({
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: null,
    documentCount: 0,
    excludedDirs: [],
    folderPath: '/library',
    id: '00000000-0000-4000-8000-000000000001',
    indexedAt: null,
    lastError: null,
    status: 'idle'
  });
});

it('saves external source settings through the native external search command', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.saveExternalSearchFolders ? [createNativeFolder()] : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const result = await saveExternalSourceSettingsFolders([createExternalSourceFolder()]);

  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.saveExternalSearchFolders, {
    folders: [
      {
        attachment_mode: 'document_relative_first_then_fixed_root',
        attachment_root_path: '/attachments',
        excluded_dirs: ['tmp'],
        folder_path: '/library',
        id: 'folder-ext'
      }
    ]
  });
  expect(result).toEqual([createExternalSourceFolder()]);
});

it('reuses the first external source settings load for prewarm and open', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.loadExternalSearchFolders ? [createNativeFolder()] : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const [first, second] = await Promise.all([
    loadExternalSourceSettingsFolders(),
    loadExternalSourceSettingsFolders()
  ]);
  const third = await loadExternalSourceSettingsFolders();

  expect(first).toEqual([createExternalSourceFolder()]);
  expect(second).toEqual(first);
  expect(third).toEqual(first);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('rebuilds external source indexes without changing the command payload shape', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.rebuildExternalSearchIndex ? [createNativeFolder()] : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await rebuildExternalSourceSettingsIndex('folder-ext');
  await rebuildExternalSourceSettingsIndex();

  expect(invoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.rebuildExternalSearchIndex, { folder_id: 'folder-ext' });
  expect(invoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.rebuildExternalSearchIndex);
});

it('uses the shared desktop folder picker for external source paths', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.selectImportDirectory ? '/library' : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(selectExternalSourceSettingsFolderPath()).resolves.toBe('/library');
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.selectImportDirectory);
});

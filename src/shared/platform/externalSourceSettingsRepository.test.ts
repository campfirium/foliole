import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import { resetExternalFolderRuntimeProviderForTest } from './externalFolderRuntime';
import {
  createDraftExternalSourceFolder,
  disconnectExternalSourceSettingsFolder,
  loadExternalSourceSettingsFolders,
  previewExternalSourceSettingsReconnect,
  reconnectExternalSourceSettingsFolder,
  removeExternalSourceSettingsFolder,
  rebuildExternalSourceSettingsIndex,
  resetExternalSourceSettingsFoldersCacheForTest,
  saveExternalSourceSettingsFolders,
  selectExternalSourceSettingsFolderPath,
  type ExternalSourceSettingsFolder
} from './externalSourceSettingsRepository';

function createExternalSourceFolder(): ExternalSourceSettingsFolder {
  return {
    accessMode: 'local',
    attachmentMode: 'document_relative_first_then_fixed_root',
    attachmentRootPath: '/attachments',
    createdAt: '2026-04-21T00:00:00.000Z',
    documentCount: 1,
    excludedDirs: ['tmp'],
    folderPath: '/library',
    id: 'folder-ext',
    indexedAt: '2026-04-21T00:00:00.000Z',
    lastError: null,
    mirrorEnabled: true,
    sourceExecutable: true,
    sourceHostName: 'This Mac',
    sourceHostPlatform: 'darwin',
    status: 'ready',
    updatedAt: '2026-04-21T00:00:00.000Z'
  };
}

function createNativeFolder(id = 'folder-ext', folderPath = '/library') {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: '/attachments',
    created_at: '2026-04-21T00:00:00.000Z',
    document_count: 1,
    excluded_dirs: ['tmp'],
    folder_path: folderPath,
    id,
    indexed_at: '2026-04-21T00:00:00.000Z',
    last_error: null,
    source_executable: true,
    source_host_name: 'This Mac',
    source_host_platform: 'darwin',
    status: 'ready',
    updated_at: '2026-04-21T00:00:00.000Z'
  };
}

function createManagedNativeFolders() {
  return [
    createNativeFolder('opened-external-documents', 'Local'),
    createNativeFolder('readwise-reader-import-articles', '/readwise')
  ];
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

it('removes one external source through its explicit native command', async () => {
  const invoke = vi.fn(async (command: string) => (command === NATIVE_COMMANDS.removeExternalSearchFolder ? [] : null));
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(removeExternalSourceSettingsFolder('folder-ext')).resolves.toEqual([]);

  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.removeExternalSearchFolder, { folder_id: 'folder-ext' });
});

it('disconnects, previews, and reconnects one external source through explicit native commands', async () => {
  const preview = {
    checked_at: '2026-08-18T00:00:00.000Z', folder_id: 'folder-ext', folder_path: '/next',
    matched_count: 1, missing_count: 2, new_count: 3
  };
  const invoke = vi.fn(async (command: string) => {
    if (command === NATIVE_COMMANDS.previewExternalSearchFolderReconnect) return preview;
    if (command === NATIVE_COMMANDS.disconnectExternalSearchFolder ||
      command === NATIVE_COMMANDS.reconnectExternalSearchFolder) return [createNativeFolder()];
    return null;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(disconnectExternalSourceSettingsFolder('folder-ext')).resolves.toEqual([createExternalSourceFolder()]);
  await expect(previewExternalSourceSettingsReconnect('folder-ext', '/next')).resolves.toEqual(preview);
  await expect(reconnectExternalSourceSettingsFolder('folder-ext', '/next')).resolves.toEqual([createExternalSourceFolder()]);
  expect(invoke).toHaveBeenNthCalledWith(1, NATIVE_COMMANDS.disconnectExternalSearchFolder, { folder_id: 'folder-ext' });
  expect(invoke).toHaveBeenNthCalledWith(2, NATIVE_COMMANDS.previewExternalSearchFolderReconnect, {
    folder_id: 'folder-ext', folder_path: '/next'
  });
  expect(invoke).toHaveBeenNthCalledWith(3, NATIVE_COMMANDS.reconnectExternalSearchFolder, {
    folder_id: 'folder-ext', folder_path: '/next'
  });
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

it('keeps Open and Readwise managed folders out of external folder settings', async () => {
  const invoke = vi.fn(async (command: string) => command === NATIVE_COMMANDS.loadExternalSearchFolders
    ? [createNativeFolder(), ...createManagedNativeFolders()]
    : null);
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(loadExternalSourceSettingsFolders()).resolves.toEqual([createExternalSourceFolder()]);
});

it('keeps managed folders out after saving and rebuilding settings', async () => {
  const nativeFolders = [createNativeFolder(), ...createManagedNativeFolders()];
  const invoke = vi.fn(async (command: string) =>
    command === NATIVE_COMMANDS.saveExternalSearchFolders || command === NATIVE_COMMANDS.rebuildExternalSearchIndex
      ? nativeFolders
      : null);
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  await expect(saveExternalSourceSettingsFolders([createExternalSourceFolder()]))
    .resolves.toEqual([createExternalSourceFolder()]);
  await expect(rebuildExternalSourceSettingsIndex())
    .resolves.toEqual([createExternalSourceFolder()]);
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
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.selectImportDirectory, {});
});

import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import { resetExternalFolderRuntimeProviderForTest } from './externalFolderRuntime';
import {
  createDraftExternalSourceFolder,
  loadExternalSourceSettingsFolders,
  rebuildExternalSourceSettingsIndex,
  resetExternalSourceSettingsFoldersCacheForTest,
  saveExternalSourceSettingsFolders,
  setExternalSourceSettingsFoldersEnabled,
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
    ownerDeviceName: null,
    ownerInstallationId: null,
    ownerPlatform: null,
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

function createRemoteNativeFolder(id: string, enabled = true) {
  return {
    ...createNativeFolder(id, `D:\\${id}`),
    access_mode: 'remote_mirror' as const,
    mirror_enabled: enabled,
    owner_device_name: 'Windows PC',
    owner_installation_id: 'windows-1',
    owner_platform: 'win32'
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
        claim_unowned: false,
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

it('updates a device folder group serially and returns the final authoritative snapshot', async () => {
  const state = [createRemoteNativeFolder('one'), createRemoteNativeFolder('two')];
  const invoke = vi.fn(async (command: string, args?: { enabled: boolean; folder_id: string }) => {
    if (command !== NATIVE_COMMANDS.setExternalSearchFolderEnabled || !args) return null;
    const folder = state.find((item) => item.id === args.folder_id);
    if (folder) folder.mirror_enabled = args.enabled;
    return state;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const result = await setExternalSourceSettingsFoldersEnabled(['one', 'two'], false);

  expect(result.error).toBeNull();
  expect(result.folders?.map((folder) => folder.mirrorEnabled)).toEqual([false, false]);
  expect(invoke.mock.calls.map((call) => call[1]?.folder_id)).toEqual(['one', 'two']);
});

it('returns the last authoritative snapshot when a later group update fails', async () => {
  const state = [createRemoteNativeFolder('one'), createRemoteNativeFolder('two')];
  const invoke = vi.fn(async (command: string, args?: { enabled: boolean; folder_id: string }) => {
    if (command !== NATIVE_COMMANDS.setExternalSearchFolderEnabled || !args) return null;
    if (args.folder_id === 'two') throw new Error('second update failed');
    const firstFolder = state[0];
    if (!firstFolder) throw new Error('missing first folder');
    firstFolder.mirror_enabled = args.enabled;
    return state;
  });
  window.electronAPI = { invoke } as unknown as ElectronAPI;

  const result = await setExternalSourceSettingsFoldersEnabled(['one', 'two'], false);

  expect(result.error).toEqual(new Error('second update failed'));
  expect(result.folders?.map((folder) => folder.mirrorEnabled)).toEqual([false, true]);
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

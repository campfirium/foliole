import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import {
  loadRuntimeLibraryPathSettings,
  updateRuntimeLibraryPathSetting
} from './libraryPathsBridge';

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
  window.electronAPI = undefined;
});

it('loads runtime library paths through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: '/library/Inbox',
    library_home: '/library',
    mirror: '/library/Mirror',
    updated_at: '2026-03-30T00:00:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeLibraryPathSettings()).resolves.toEqual({
    assetsDir: '/library/Assets',
    dataDir: '/library/Data',
    databasePath: '/library/Data/foliole.db',
    inbox: '/library/Inbox',
    libraryHome: '/library',
    mirror: '/library/Mirror',
    updatedAt: '2026-03-30T00:00:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('load_library_path_settings');
});

it('updates a library path through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: '/capture/Inbox',
    library_home: '/library',
    mirror: '/library/Mirror',
    updated_at: '2026-03-30T00:10:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(updateRuntimeLibraryPathSetting('inbox', '/capture/Inbox')).resolves.toMatchObject({
    inbox: '/capture/Inbox'
  });
  expect(invoke).toHaveBeenCalledWith('update_library_path_setting', {
    location: 'inbox',
    path: '/capture/Inbox'
  });
});

it('returns null when the runtime library path payload is malformed', async () => {
  const invoke = vi.fn().mockResolvedValue({ library_home: '/library' });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeLibraryPathSettings()).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native library path payload invalid',
    expect.objectContaining({
      action: 'load_runtime_library_path_settings',
      area: 'bridge',
      command: 'load_library_path_settings',
      fallback: 'return_null'
    })
  );
});

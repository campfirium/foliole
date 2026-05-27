import { beforeEach, expect, it, vi } from 'vitest';

import { loadRuntimeDatabaseMaintenanceStatus } from './databaseMaintenanceStatusRuntimeRepository';
import type { ElectronAPI } from './electronApi';

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
  delete window.electronAPI;
});

it('loads database maintenance status through the native bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    entries: [
      {
        backup_role: 'included',
        key: 'main-data',
        rebuild_role: 'not-applicable',
        size_bytes: 1024,
        state: 'present'
      },
      {
        backup_role: 'excluded',
        key: 'search-data',
        rebuild_role: 'rebuildable-from-main-data',
        size_bytes: 0,
        state: 'absent'
      },
      {
        backup_role: 'excluded',
        key: 'external-sources-data',
        rebuild_role: 'rebuildable-from-main-data',
        size_bytes: null,
        state: 'unreadable'
      }
    ],
    updated_at: '2026-05-28T00:00:00.000Z'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeDatabaseMaintenanceStatus()).resolves.toEqual({
    entries: [
      {
        backupRole: 'included',
        key: 'main-data',
        rebuildRole: 'not-applicable',
        sizeBytes: 1024,
        state: 'present'
      },
      {
        backupRole: 'excluded',
        key: 'search-data',
        rebuildRole: 'rebuildable-from-main-data',
        sizeBytes: 0,
        state: 'absent'
      },
      {
        backupRole: 'excluded',
        key: 'external-sources-data',
        rebuildRole: 'rebuildable-from-main-data',
        sizeBytes: null,
        state: 'unreadable'
      }
    ],
    updatedAt: '2026-05-28T00:00:00.000Z'
  });
  expect(invoke).toHaveBeenCalledWith('load_database_maintenance_status');
});

it('returns null when the native payload is malformed', async () => {
  const invoke = vi.fn().mockResolvedValue({
    entries: [{ key: 'main-data', state: 'present', size_bytes: null }],
    updated_at: '2026-05-28T00:00:00.000Z'
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeDatabaseMaintenanceStatus()).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native database maintenance payload invalid',
    expect.objectContaining({
      action: 'load_runtime_database_maintenance_status',
      area: 'bridge',
      command: 'load_database_maintenance_status',
      fallback: 'return_null'
    })
  );
});

it('returns null when the desktop bridge is unavailable', async () => {
  await expect(loadRuntimeDatabaseMaintenanceStatus()).resolves.toBeNull();
});

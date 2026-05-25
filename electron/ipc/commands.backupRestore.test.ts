// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';

const {
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
} = vi.hoisted(() => ({
  createApplicationDatabaseBackup: vi.fn().mockResolvedValue({
    sourcePath: '/app/foliole.db',
    destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
    extraBackup: { destinationPath: null, errorMessage: null, status: 'disabled' },
    totalPages: 3,
    remainingPages: 0
  }),
  listApplicationDatabaseBackups: vi.fn().mockResolvedValue([
    {
      autoFrequency: null,
      fileName: 'manual-2026-03-14_10-00-00-000.db',
      filePath: '/app/Backups/manual-2026-03-14_10-00-00-000.db',
      kind: 'manual',
      snapshotReason: null,
      sizeBytes: 4096,
      updatedAt: '2026-03-14T10:00:00.000Z'
    }
  ]),
  restoreApplicationDatabaseBackup: vi.fn().mockResolvedValue({
    sourcePath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
    targetPath: '/app/foliole.db',
    totalPages: 3,
    remainingPages: 0
  })
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));

vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./boot.js', () => ({
  appendBootEvent: vi.fn(),
  bootReport: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn(),
  reviewPreview: vi.fn()
}));
vi.mock('../database/backupRestore.js', () => ({
  createApplicationDatabaseBackup,
  listApplicationDatabaseBackups,
  restoreApplicationDatabaseBackup
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('dispatches sqlite backup command through invoke handler', async () => {
  await expect(
    handleInvokeRequest({
      command: 'backup_sqlite_database',
      args: { destinationPath: '/tmp/backup.db' }
    })
  ).resolves.toEqual({
    sourcePath: '/app/foliole.db',
    destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
    extraBackup: { destinationPath: null, errorMessage: null, status: 'disabled' },
    totalPages: 3,
    remainingPages: 0
  });

  expect(createApplicationDatabaseBackup).toHaveBeenCalledWith({ destinationPath: '/tmp/backup.db' });
});

it('dispatches sqlite backup command without destination path override', async () => {
  await expect(
    handleInvokeRequest({
      command: 'backup_sqlite_database',
      args: {}
    })
  ).resolves.toEqual({
    sourcePath: '/app/foliole.db',
    destinationPath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
    extraBackup: { destinationPath: null, errorMessage: null, status: 'disabled' },
    totalPages: 3,
    remainingPages: 0
  });

  expect(createApplicationDatabaseBackup).toHaveBeenCalledWith({ destinationPath: undefined });
});

it('dispatches sqlite backup listing command through invoke handler', async () => {
  await expect(
    handleInvokeRequest({
      command: 'list_sqlite_backups'
    })
  ).resolves.toEqual([
    {
      autoFrequency: null,
      fileName: 'manual-2026-03-14_10-00-00-000.db',
      filePath: '/app/Backups/manual-2026-03-14_10-00-00-000.db',
      kind: 'manual',
      snapshotReason: null,
      sizeBytes: 4096,
      updatedAt: '2026-03-14T10:00:00.000Z'
    }
  ]);

  expect(listApplicationDatabaseBackups).toHaveBeenCalledWith();
});

it('dispatches sqlite restore command through invoke handler', async () => {
  await expect(
    handleInvokeRequest({
      command: 'restore_sqlite_database',
      args: { sourcePath: '/tmp/backup.db' }
    })
  ).resolves.toEqual({
    sourcePath: '/app/Backups/manual-2026-04-02_09-00-00-000.db',
    targetPath: '/app/foliole.db',
    totalPages: 3,
    remainingPages: 0
  });

  expect(restoreApplicationDatabaseBackup).toHaveBeenCalledWith({ sourcePath: '/tmp/backup.db' });
});

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
    destinationPath: '/app/backups/foliole.db',
    totalPages: 3,
    remainingPages: 0
  }),
  listApplicationDatabaseBackups: vi.fn().mockResolvedValue([
    {
      fileName: 'foliole-2026-03-14_10-00-00-000.db',
      filePath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
      sizeBytes: 4096,
      updatedAt: '2026-03-14T10:00:00.000Z'
    }
  ]),
  restoreApplicationDatabaseBackup: vi.fn().mockResolvedValue({
    sourcePath: '/app/backups/foliole.db',
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
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
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
    destinationPath: '/app/backups/foliole.db',
    totalPages: 3,
    remainingPages: 0
  });

  expect(createApplicationDatabaseBackup).toHaveBeenCalledWith({ destinationPath: '/tmp/backup.db' });
});

it('dispatches sqlite backup listing command through invoke handler', async () => {
  await expect(
    handleInvokeRequest({
      command: 'list_sqlite_backups'
    })
  ).resolves.toEqual([
    {
      fileName: 'foliole-2026-03-14_10-00-00-000.db',
      filePath: '/app/backups/foliole-2026-03-14_10-00-00-000.db',
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
    sourcePath: '/app/backups/foliole.db',
    targetPath: '/app/foliole.db',
    totalPages: 3,
    remainingPages: 0
  });

  expect(restoreApplicationDatabaseBackup).toHaveBeenCalledWith({ sourcePath: '/tmp/backup.db' });
});

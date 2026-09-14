// @vitest-environment node

import { expect, it, vi } from 'vitest';

const sessions = vi.hoisted(() => ({
  cancel: vi.fn(async () => undefined),
  next: vi.fn(async () => ({ skipped_backup_count: 0, status: 'complete' })),
  start: vi.fn(async () => ({ session_id: 'opaque' }))
}));

vi.mock('./backupSearchSessions.js', () => ({
  cancelBackupSearchSession: sessions.cancel,
  nextBackupSearchSession: sessions.next,
  startBackupSearchSession: sessions.start
}));
vi.mock('../database/backupRestore.js', () => ({
  createApplicationDatabaseBackup: vi.fn(),
  listApplicationDatabaseBackups: vi.fn(),
  restoreApplicationDatabaseBackup: vi.fn()
}));
vi.mock('../database/backupRetentionStatus.js', () => ({ loadBackupRetentionStatus: vi.fn() }));
vi.mock('../database/backupSettings.js', () => ({ loadBackupSettings: vi.fn() }));
vi.mock('../database/databaseCompaction.js', () => ({
  compactApplicationDatabase: vi.fn(), loadApplicationDatabaseSpaceStatus: vi.fn()
}));

import { handleSqliteMaintenanceCommand } from './storageCommandSupport.js';

const owner = { id: 7 } as unknown as import('electron').WebContents;

it('accepts only a query when starting and ignores renderer-provided backup paths', async () => {
  await expect(handleSqliteMaintenanceCommand('start_backup_search', {
    query: 'needle', sourcePath: '/renderer/injected.db'
  }, owner)).resolves.toEqual({ session_id: 'opaque' });
  expect(sessions.start).toHaveBeenCalledWith('needle', owner);
});

it('routes next and cancel only through an opaque owner-bound session id', async () => {
  await expect(handleSqliteMaintenanceCommand('next_backup_search', {
    session_id: 'opaque', sourcePath: '/renderer/injected.db'
  }, owner)).resolves.toEqual({ skipped_backup_count: 0, status: 'complete' });
  await expect(handleSqliteMaintenanceCommand('cancel_backup_search', {
    session_id: 'opaque'
  }, owner)).resolves.toBeNull();
  expect(sessions.next).toHaveBeenCalledWith('opaque', owner);
  expect(sessions.cancel).toHaveBeenCalledWith('opaque', owner);
});

// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { BACKUP_MANAGEMENT_FILE } from './backupManagement.js';
import { createApplicationDatabaseBackup } from './backupRestore.js';
import { saveBackupSettings } from './backupSettings.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { textDevice } from './topicTextState.testSupport.js';

const fixture = vi.hoisted(() => ({ open: vi.fn(), beforeVerify: vi.fn<(filePath: string) => void>() }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('./connection.js', () => ({ openDatabaseConnection: fixture.open,
  runWithDatabaseConnectionOwner: (run: () => unknown) => run() }));
vi.mock('./migrate.js', () => ({ initializeDatabase: vi.fn() }));
vi.mock('./databaseBackupRestoration.js', () => ({ restoreDatabaseBackupInMaintenance: vi.fn() }));
vi.mock('../sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));
vi.mock('./backupFileDisposition.js', () => ({ moveManagedBackupToTrash: (filePath: string) => fs.rm(filePath) }));
vi.mock('./sqliteFileOffMainThread.js', () => ({
  backupSqliteFileOffMainThread: (_source: string, _destination: string, fallback: () => Promise<unknown>) => fallback(),
  verifySqliteDatabaseFileOffMainThread: async (filePath: string) => {
    const sqlite = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
      expect(sqlite.pragma('quick_check', { simple: true })).toBe('ok');
      fixture.beforeVerify(filePath);
    } finally { sqlite.close(); }
  }
}));

it('does not prune a newly selected backup directory when an in-flight backup finishes elsewhere', async () => {
  const artifacts = path.resolve('.tmp/artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'T858-15-backup-directory-'));
  const dbPath = path.join(root, 'library.db');
  const { sqlite } = textDevice(dbPath);
  try {
    sqlite.prepare('INSERT INTO settings VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify('Review desktop'), new Date().toISOString());
    fixture.open.mockReturnValue({ dbPath, sqlite, driver: createBetterSqlite3Driver(sqlite) });
    const firstDirectory = path.join(root, 'first-backups');
    const nextDirectory = path.join(root, 'next-backups');
    saveBackupSettings({ backup_dir: firstDirectory });
    await fs.mkdir(nextDirectory);
    const legacyName = 'foliole-auto-260901-090000.db';
    const legacyPath = path.join(nextDirectory, legacyName);
    await sqlite.backup(legacyPath);
    const registryPath = path.join(nextDirectory, BACKUP_MANAGEMENT_FILE);
    const registry = JSON.stringify({ version: 1, whitelist: [], temporary: { [legacyName]: 1 } });
    await fs.writeFile(registryPath, registry);
    fixture.beforeVerify.mockImplementationOnce(() => saveBackupSettings({ backup_dir: nextDirectory }));

    const backup = await createApplicationDatabaseBackup();

    expect(path.dirname(backup.destinationPath)).toBe(firstDirectory);
    await expect(fs.access(backup.destinationPath)).resolves.toBeUndefined();
    await expect(fs.access(legacyPath)).resolves.toBeUndefined();
    await expect(fs.readFile(registryPath, 'utf8')).resolves.toBe(registry);
  } finally {
    sqlite.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

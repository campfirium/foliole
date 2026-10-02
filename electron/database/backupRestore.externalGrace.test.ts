// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { pruneManagedDatabaseBackups } from './backupCatalog.js';
import { seedNode } from './backupRestore.fixture.js';
import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { loadBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let root = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
    app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs') })
}));
vi.mock('./backupCleanupNotification.js', () => ({ showBackupCleanupNotification: vi.fn() }));
vi.mock('./backupFileDisposition.js', () => ({
  moveManagedBackupToTrash: async (filePath: string) => { await fs.rm(filePath); }
}));

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-external-'));
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it.each(['foliole-auto-250101-100000.db.gz', 'pre-restore-2025-01-01_10-00-00-000.db.gz'])('keeps copied %s usable through cleanup and cold reopen until its deadline', async (copiedName) => {
  seedNode('external-grace-node', '# original');
  const generated = await createApplicationDatabaseBackup();
  const directory = path.dirname(generated.destinationPath);
  const copied = path.join(directory, copiedName);
  await fs.copyFile(generated.destinationPath, copied);
  const oldTime = new Date('2025-01-01T10:00:00Z');
  await fs.utimes(copied, oldTime, oldTime);
  const discoveredAt = Date.now();
  const prune = (now: number) => pruneManagedDatabaseBackups(directory,
    { ...loadBackupSettings(), total_size_limit_bytes: 1 },
    { now, disposeFile: async (filePath) => { await fs.rm(filePath); } });
  await prune(discoveredAt);
  await fs.access(copied);
  seedNode('external-grace-node', '# changed');
  closeDatabaseConnection();
  initializeDatabase();
  await restoreApplicationDatabaseBackup({ sourcePath: copied });
  expect(loadWorkspaceSnapshot({ includeBody: true })?.nodesById['external-grace-node']?.content).toBe('# original');
  expect(openDatabaseConnection().sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
  await prune(discoveredAt + 24 * 60 * 60 * 1000 - 1);
  await fs.access(copied);
  const result = await prune(discoveredAt + 24 * 60 * 60 * 1000);
  expect(result.temporaryDeletedCount).toBe(1);
  await expect(fs.access(copied)).rejects.toMatchObject({ code: 'ENOENT' });
});

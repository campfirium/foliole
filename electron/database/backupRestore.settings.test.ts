// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { loadBackupSettings, saveBackupSettings } from './backupSettings.js';
import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-settings-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('restores library content without rolling back current backup controls', async () => {
  const oldBackupDir = path.join(tempRoot, 'old-backups');
  saveBackupSettings({
    backup_dir: oldBackupDir,
    daily_max_count: 2,
    extra_backup_dir: path.join(tempRoot, 'old-extra'),
    extra_backup_max_count: 2,
    hourly_max_count: 2,
    monthly_max_count: 0,
    retention_priority: ['hourly', 'daily', 'weekly', 'monthly'],
    safety_max_count: 1,
    total_size_limit_bytes: 64 * 1024 * 1024,
    weekly_max_count: 0
  });
  seedNode('# backup content');
  const backup = await createApplicationDatabaseBackup();

  const currentBackupDir = path.join(tempRoot, 'current-backups');
  saveBackupSettings({
    backup_dir: currentBackupDir,
    daily_max_count: 5,
    extra_backup_dir: path.join(tempRoot, 'current-extra'),
    extra_backup_max_count: 4,
    hourly_max_count: 8,
    monthly_max_count: 1,
    retention_priority: ['monthly', 'daily', 'hourly', 'weekly'],
    safety_max_count: 3,
    total_size_limit_bytes: 256 * 1024 * 1024,
    weekly_max_count: 2
  });
  const current = loadBackupSettings();
  seedNode('# current content');

  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  expect(currentContent()).toBe('# backup content');
  expect(withoutUpdatedAt(loadBackupSettings())).toEqual(withoutUpdatedAt(current));
  expect((await fs.readdir(currentBackupDir)).some((name) => name.startsWith('foliole-rollback-'))).toBe(true);
  await expect(fs.access(backup.destinationPath)).resolves.toBeUndefined();
});

function withoutUpdatedAt(settings: ReturnType<typeof loadBackupSettings>) {
  return { ...settings, updated_at: '' };
}

function currentContent() {
  return loadWorkspaceSnapshot({ includeBody: true })?.nodesById['node-1']?.content;
}

function seedNode(content: string) {
  upsertNodeSnapshot({
    anchorLink: null, content, createdAt: '2026-09-14T00:00:00.000Z', isTitleManual: true,
    kind: 'topic', nodeId: 'node-1', parentNodeId: null, position: 0, reveal: null,
    title: 'node-1', updatedAt: new Date().toISOString()
  });
}

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { BackupRestoreSyncPreview, BackupRestoreSyncSettings } from '../../lib/platform/backupRestoreSyncContract.js';
import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings.js';

import { snapshotBackupRestoreSource } from './backupRestoreSourceSnapshot.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { openDatabaseConnection } from './connection.js';
import { createDatabaseRestoreArtifacts } from './databaseRestoreArtifacts.js';
import { verifySqliteDatabaseFile } from './sqliteBackupRestore.js';

export function readBackupRestoreSyncSettings(driver: DatabaseDriver) {
  const tables = new Set(driver.queryAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
  const group = tables.has('sync_group_local_state') ? driver.queryOne<{
    group_id: string; display_name: string; workgroup_key: string;
  }>(`SELECT g.group_id, g.display_name, g.workgroup_key FROM sync_groups g
    JOIN sync_group_local_state l ON l.group_id = g.group_id
    WHERE l.singleton_id = 1 AND l.state = 'active'`) : undefined;
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'app_settings'");
  const settings = row ? JSON.parse(row.value) as Record<string, string> : {};
  return {
    group: group ? { id: group.group_id, name: group.display_name } : null,
    enabled: settings[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled] === 'true',
    paused: Boolean(driver.queryOne("SELECT key FROM settings WHERE key = 'backup_restore_pending_sync'")) ||
      settings[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused] === 'true',
    secret: group?.workgroup_key ?? null
  };
}

function publicSettings(settings: ReturnType<typeof readBackupRestoreSyncSettings>): BackupRestoreSyncSettings {
  return { group: settings.group, enabled: settings.enabled, paused: settings.paused };
}

export async function buildBackupRestoreSyncPreview(sourcePath: string, backupDriver: DatabaseDriver,
  currentDriver: DatabaseDriver): Promise<BackupRestoreSyncPreview> {
  const backup = readBackupRestoreSyncSettings(backupDriver);
  const current = readBackupRestoreSyncSettings(currentDriver);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(sourcePath)) digest.update(chunk);
  digest.update(JSON.stringify({ backup, current }));
  return { backup: publicSettings(backup), current: publicSettings(current),
    same: JSON.stringify(backup) === JSON.stringify(current), revision: digest.digest('hex') };
}

export async function inspectBackupRestoreSync(sourcePath: string) {
  const connection = openDatabaseConnection();
  const artifacts = createDatabaseRestoreArtifacts();
  try {
    const file = await snapshotBackupRestoreSource(artifacts, sourcePath, path.dirname(connection.dbPath));
    verifySqliteDatabaseFile(file);
    const sqlite = new Database(file, { readonly: true, fileMustExist: true });
    try {
      return await buildBackupRestoreSyncPreview(file, createBetterSqlite3Driver(sqlite), connection.driver);
    } finally { sqlite.close(); }
  } finally { await artifacts.finishTemporary(); }
}

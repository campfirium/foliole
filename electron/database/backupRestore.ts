import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import {
  listManagedDatabaseBackups,
  pruneManagedDatabaseBackups,
  type ApplicationDatabaseBackupEntry
} from './backupCatalog.js';
import { showBackupCleanupNotification } from './backupCleanupNotification.js';
import { finestEnabledFrequency, frequencyBucketKey } from './backupRetentionPolicy.js';
import {
  ensureManagedBackupDirectory,
  loadBackupSettings,
  resolveManagedBackupDirectory
} from './backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { copyExtraBackup, disabledExtraBackupResult, type ExtraBackupCopyResult } from './extraBackupCopies.js';
import { createInternalDatabaseSnapshotWithBackup } from './internalSnapshots.js';
import { initializeDatabase } from './migrate.js';
import { markNodeSyncRestoreIncarnation } from './nodeSyncVersions.js';
import {
  backupSqliteDatabase,
  restoreSqliteDatabase,
  type SqliteBackupResult,
  type SqliteRestoreResult
} from './sqliteBackupRestore.js';

export interface CreateApplicationDatabaseBackupOptions {
  destinationPath?: string;
}

export type ApplicationDatabaseBackupResult = SqliteBackupResult & {
  extraBackup: ExtraBackupCopyResult;
};

export interface RestoreApplicationDatabaseBackupOptions {
  sourcePath: string;
}

export type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';

function backupFileTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function buildManagedBackupPath(prefix: string, now: Date, backupDirectory = resolveManagedBackupDirectory()) {
  return path.join(backupDirectory, `${prefix}-${backupFileTimestamp(now)}.db`);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function automaticBackupFileName(now: Date) {
  const date = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `foliole-auto-backup-${date}-${time}.db`;
}

async function pruneBackupsNow(now = new Date()) {
  const settings = loadBackupSettings();
  const result = await pruneManagedDatabaseBackups(resolveManagedBackupDirectory(settings), settings, now);
  showBackupCleanupNotification(result);
}

async function createAutomaticBackup(now: Date, backupDirectory: string) {
  const settings = loadBackupSettings();
  const destinationPath = path.join(backupDirectory, automaticBackupFileName(now));
  if (existsSync(destinationPath)) {
    console.warn('[backup] automatic restore point already exists', destinationPath);
    return;
  }
  const connection = openDatabaseConnection();
  const result = await backupSqliteDatabase({
    destinationPath,
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
  await fs.utimes(result.destinationPath, now, now);
  await copyExtraBackup({
    extraBackupDir: settings.extra_backup_dir,
    maxCount: settings.extra_backup_max_count,
    primaryBackupDir: backupDirectory,
    sourcePath: result.destinationPath
  });
}

export async function reconcileAutomaticDatabaseBackups(now = new Date()) {
  const settings = loadBackupSettings();
  const backupDirectory = ensureManagedBackupDirectory(settings);
  const existingEntries = await listManagedDatabaseBackups(backupDirectory);

  const cadence = finestEnabledFrequency(settings);
  const alreadyExists = cadence
    ? existingEntries.some((entry) =>
        entry.kind === 'automatic' &&
        frequencyBucketKey(new Date(entry.updatedAt), cadence) === frequencyBucketKey(now, cadence)
      )
    : true;
  if (!alreadyExists) {
    await createAutomaticBackup(now, backupDirectory);
  }

  const pruneResult = await pruneManagedDatabaseBackups(backupDirectory, settings, now);
  showBackupCleanupNotification(pruneResult);
}

export async function createApplicationDatabaseBackup(
  options: CreateApplicationDatabaseBackupOptions = {}
): Promise<ApplicationDatabaseBackupResult> {
  const connection = initializeDatabase();
  const now = new Date();
  const settings = loadBackupSettings();
  const backupDirectory = ensureManagedBackupDirectory(settings);
  const destinationPath =
    options.destinationPath ?? buildManagedBackupPath('manual', now, backupDirectory);
  const result = await backupSqliteDatabase({
    sourcePath: connection.dbPath,
    destinationPath,
    sourceDatabase: connection.sqlite
  });
  const extraBackup = options.destinationPath
    ? disabledExtraBackupResult()
    : await copyExtraBackup({
        extraBackupDir: settings.extra_backup_dir,
        maxCount: settings.extra_backup_max_count,
        primaryBackupDir: backupDirectory,
        sourcePath: result.destinationPath
      });
  await pruneBackupsNow(now);
  return { ...result, extraBackup };
}

export async function restoreApplicationDatabaseBackup(
  options: RestoreApplicationDatabaseBackupOptions
): Promise<SqliteRestoreResult> {
  const connection = openDatabaseConnection();
  const targetPath = connection.dbPath;
  await createInternalDatabaseSnapshotWithBackup({
    reason: 'pre-restore',
    sourceDatabase: connection.sqlite,
    sourcePath: targetPath
  });
  closeDatabaseConnection();
  const result = await restoreSqliteDatabase({ sourcePath: options.sourcePath, targetPath });
  initializeDatabase();
  markNodeSyncRestoreIncarnation();
  await pruneBackupsNow();
  return result;
}

export async function listApplicationDatabaseBackups(): Promise<ApplicationDatabaseBackupEntry[]> {
  await pruneBackupsNow();
  return listManagedDatabaseBackups(resolveManagedBackupDirectory());
}

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
import { cleanupOrphanedBackupTemporaryFiles } from './backupTemporaryFileCleanup.js';
import {
  backupCompressedSqliteDatabase,
  COMPRESSED_SQLITE_BACKUP_SUFFIX,
  materializeCompressedSqliteBackup
} from './compressedSqliteBackup.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { copyExtraBackup, disabledExtraBackupResult, type ExtraBackupCopyResult } from './extraBackupCopies.js';
import {
  assertManagedSafetySnapshotIntegrity,
  createManagedSafetySnapshotWithBackup,
  waitForManagedSafetySnapshotSettlements
} from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
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
  return path.join(backupDirectory, `${prefix}-${backupFileTimestamp(now)}${COMPRESSED_SQLITE_BACKUP_SUFFIX}`);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function automaticBackupFileName(now: Date) {
  const date = `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `foliole-auto-backup-${date}-${time}${COMPRESSED_SQLITE_BACKUP_SUFFIX}`;
}

async function pruneBackupsNow(now = new Date()) {
  await waitForManagedSafetySnapshotSettlements();
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
  const result = await backupCompressedSqliteDatabase({
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
  await waitForManagedSafetySnapshotSettlements();
  const settings = loadBackupSettings();
  const backupDirectory = ensureManagedBackupDirectory(settings);
  const temporaryCleanup = await cleanupOrphanedBackupTemporaryFiles(backupDirectory);
  if (temporaryCleanup.deletedCount > 0) {
    console.info('[backup] removed interrupted compression files', temporaryCleanup);
  }
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
  return temporaryCleanup;
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
  const backupOptions = {
    sourcePath: connection.dbPath,
    destinationPath,
    sourceDatabase: connection.sqlite
  };
  const result = options.destinationPath
    ? await backupSqliteDatabase(backupOptions)
    : await backupCompressedSqliteDatabase(backupOptions);
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
  const safetySnapshot = await createManagedSafetySnapshotWithBackup({
    reason: 'pre-restore',
    sourceDatabase: connection.sqlite,
    sourcePath: targetPath
  });
  let materialized: Awaited<ReturnType<typeof materializeCompressedSqliteBackup>> | null = null;
  let restored = false;
  try {
    await assertManagedSafetySnapshotIntegrity(safetySnapshot.currentPath);
    materialized = await materializeCompressedSqliteBackup(options.sourcePath, path.dirname(targetPath));
    closeDatabaseConnection();
    const result = await restoreSqliteDatabase({ sourcePath: materialized.databasePath, targetPath });
    initializeDatabase();
    restored = true;
    return { ...result, sourcePath: path.resolve(options.sourcePath) };
  } finally {
    await materialized?.cleanup();
    safetySnapshot.release();
    if (restored) {
      await pruneBackupsNow();
    }
  }
}

export async function listApplicationDatabaseBackups(): Promise<ApplicationDatabaseBackupEntry[]> {
  await waitForManagedSafetySnapshotSettlements();
  await pruneBackupsNow();
  return listManagedDatabaseBackups(resolveManagedBackupDirectory());
}

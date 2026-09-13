import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import {
  listManagedDatabaseBackups,
  pruneManagedDatabaseBackups,
  type ApplicationDatabaseBackupEntry
} from './backupCatalog.js';
import { showBackupCleanupNotification } from './backupCleanupNotification.js';
import { moveManagedBackupToTrash } from './backupFileDisposition.js';
import { automaticBackupFileName, buildManagedBackupPath } from './backupFileNames.js';
import { finestEnabledFrequency, frequencyBucketKey } from './backupRetentionPolicy.js';
import {
  ensureManagedBackupDirectory,
  loadBackupSettings,
  resolveManagedBackupDirectory
} from './backupSettings.js';
import { cleanupOrphanedBackupTemporaryFiles } from './backupTemporaryFileCleanup.js';
import {
  backupCompressedSqliteDatabase,
  materializeCompressedSqliteBackup
} from './compressedSqliteBackup.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection,
  openDatabaseConnection,
  runWithDatabaseConnectionMaintenance
} from './connection.js';
import { recoverCurrentDatabaseAfterRestoreFailure } from './databaseRestoreRecovery.js';
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
  verifySqliteDatabaseFile,
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

let restoreInProgress = false;

async function pruneBackupsNow() {
  await waitForManagedSafetySnapshotSettlements();
  const settings = loadBackupSettings();
  const result = await pruneManagedDatabaseBackups(resolveManagedBackupDirectory(settings), settings, {
    disposeFile: moveManagedBackupToTrash
  });
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
    disposeFile: moveManagedBackupToTrash,
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

  const pruneResult = await pruneManagedDatabaseBackups(backupDirectory, settings, {
    disposeFile: moveManagedBackupToTrash
  });
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
        disposeFile: moveManagedBackupToTrash,
        extraBackupDir: settings.extra_backup_dir,
        maxCount: settings.extra_backup_max_count,
        primaryBackupDir: backupDirectory,
        sourcePath: result.destinationPath
      });
  await pruneBackupsNow();
  return { ...result, extraBackup };
}

export async function restoreApplicationDatabaseBackup(
  options: RestoreApplicationDatabaseBackupOptions
): Promise<SqliteRestoreResult> {
  if (restoreInProgress) {
    throw new Error('Another backup restore is already in progress.');
  }
  restoreInProgress = true;
  let resumeLibraryTasks: (() => void) | null = null;
  try {
    resumeLibraryTasks = await desktopTaskScheduler.pauseResource('library');
    return await runWithDatabaseConnectionMaintenance(() => restoreDatabaseBackupInMaintenance(options));
  } finally {
    resumeLibraryTasks?.();
    restoreInProgress = false;
  }
}

async function restoreDatabaseBackupInMaintenance(
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
  let connectionClosed = false;
  let replacementComplete = false;
  let restored = false;
  try {
    await assertManagedSafetySnapshotIntegrity(safetySnapshot.currentPath);
    materialized = await materializeCompressedSqliteBackup(options.sourcePath, path.dirname(targetPath));
    verifySqliteDatabaseFile(materialized.databasePath);
    closeDatabaseConnection();
    connectionClosed = true;
    const result = await restoreSqliteDatabase({ sourcePath: materialized.databasePath, targetPath });
    replacementComplete = true;
    initializeWorkspaceSearchSidecar(initializeDatabase(), { requireCurrentSource: true });
    clearDatabaseConnectionUnavailable();
    restored = true;
    return { ...result, sourcePath: path.resolve(options.sourcePath) };
  } catch (error) {
    if (!connectionClosed) {
      console.error('[backup] restore failed before database replacement', error);
      throw new Error('The selected backup was not restored. Your current library is unchanged.');
    }
    await recoverCurrentDatabaseAfterRestoreFailure({
      error,
      replacementComplete,
      safetySnapshot,
      targetPath
    });
    throw new Error('The selected backup was not restored. Your current library has been restored.');
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

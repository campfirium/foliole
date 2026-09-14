import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { commitAutomaticBackupWhenChanged } from './automaticBackupCandidate.js';
import {
  listManagedDatabaseBackups,
  pruneManagedDatabaseBackups,
  type ApplicationDatabaseBackupEntry
} from './backupCatalog.js';
import { showBackupCleanupNotification } from './backupCleanupNotification.js';
import { moveManagedBackupToTrash } from './backupFileDisposition.js';
import { automaticBackupFileName, buildManagedBackupPath } from './backupFileNames.js';
import { finestEnabledFrequency, frequencyBucketKey } from './backupRetentionPolicy.js';
import { recordBackupCleanup } from './backupRetentionStatus.js';
import {
  ensureManagedBackupDirectory,
  loadBackupSettings,
  resolveManagedBackupDirectory
} from './backupSettings.js';
import { cleanupOrphanedBackupTemporaryFiles } from './backupTemporaryFileCleanup.js';
import { backupCompressedSqliteDatabase } from './compressedSqliteBackup.js';
import {
  openDatabaseConnection,
  runWithDatabaseConnectionMaintenance
} from './connection.js';
import { restoreDatabaseBackupInMaintenance } from './databaseBackupRestoration.js';
import { copyExtraBackup, disabledExtraBackupResult, type ExtraBackupCopyResult } from './extraBackupCopies.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { cleanupOrphanedBackupSidecars } from './orphanedBackupSidecars.js';
import {
  backupSqliteDatabase,
  verifySqliteDatabaseFile,
  type SqliteBackupResult,
  type SqliteRestoreResult
} from './sqliteBackupRestore.js';

export interface CreateApplicationDatabaseBackupOptions {
  destinationPath?: string;
}

export type ApplicationDatabaseBackupResult = SqliteBackupResult & {
  extraBackup: ExtraBackupCopyResult;
  sidecarCleanup: Awaited<ReturnType<typeof cleanupOrphanedBackupSidecars>>;
};

export interface RestoreApplicationDatabaseBackupOptions {
  sourcePath: string;
}

export type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';

let restoreInProgress = false;
const reconciledCadenceBuckets = new Map<string, string>();

async function pruneBackupsNow() {
  await waitForManagedSafetySnapshotSettlements();
  const settings = loadBackupSettings();
  const backupDirectory = resolveManagedBackupDirectory(settings);
  const result = await pruneManagedDatabaseBackups(backupDirectory, settings, {
    disposeFile: moveManagedBackupToTrash
  });
  recordBackupCleanup(backupDirectory, result);
  showBackupCleanupNotification(result);
}

async function createAutomaticBackup(
  now: Date,
  backupDirectory: string,
  latestOrdinary: ApplicationDatabaseBackupEntry | null
) {
  const settings = loadBackupSettings();
  const destinationPath = path.join(backupDirectory, automaticBackupFileName(now));
  if (existsSync(destinationPath)) {
    console.warn('[backup] automatic restore point already exists', destinationPath);
    return false;
  }
  const connection = openDatabaseConnection();
  const result = await commitAutomaticBackupWhenChanged({
    destinationPath,
    latestOrdinary,
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
  if (!result) return false;
  await fs.utimes(result.destinationPath, now, now);
  await copyExtraBackup({
    disposeFile: moveManagedBackupToTrash,
    extraBackupDir: settings.extra_backup_dir,
    maxCount: settings.extra_backup_max_count,
    primaryBackupDir: backupDirectory,
    sourcePath: result.destinationPath
  });
  const sidecarCleanup = await cleanupOrphanedBackupSidecars(backupDirectory);
  reportSidecarCleanup(sidecarCleanup);
  return true;
}

export async function reconcileAutomaticDatabaseBackups(now = new Date()) {
  await waitForManagedSafetySnapshotSettlements();
  const settings = loadBackupSettings();
  const cadence = finestEnabledFrequency(settings);
  const connection = openDatabaseConnection();
  const noCleanup = { deletedCount: 0, failedCount: 0, releasedBytes: 0 };
  const backupDirectory = ensureManagedBackupDirectory(settings);
  if (!cadence) return noCleanup;
  const cadenceBucket = frequencyBucketKey(now, cadence);
  if (reconciledCadenceBuckets.get(connection.dbPath) === cadenceBucket) return noCleanup;
  const temporaryCleanup = await cleanupOrphanedBackupTemporaryFiles(backupDirectory);
  if (temporaryCleanup.deletedCount > 0) {
    console.info('[backup] removed interrupted compression files', temporaryCleanup);
  }
  const existingEntries = await listManagedDatabaseBackups(backupDirectory);

  const alreadyExists = existingEntries.some((entry) =>
    entry.kind === 'automatic' &&
    frequencyBucketKey(new Date(entry.updatedAt), cadence) === cadenceBucket);
  const latestOrdinary = existingEntries.find((entry) =>
    entry.kind === 'automatic' || entry.kind === 'manual') ?? null;
  const created = !alreadyExists && await createAutomaticBackup(now, backupDirectory, latestOrdinary);
  reconciledCadenceBuckets.set(connection.dbPath, cadenceBucket);
  if (created) {
    const pruneResult = await pruneManagedDatabaseBackups(backupDirectory, settings, {
      disposeFile: moveManagedBackupToTrash
    });
    recordBackupCleanup(backupDirectory, pruneResult);
    showBackupCleanupNotification(pruneResult);
  }
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
    options.destinationPath ?? buildManagedBackupPath(now, backupDirectory);
  const backupOptions = {
    sourcePath: connection.dbPath,
    destinationPath,
    sourceDatabase: connection.sqlite
  };
  const result = options.destinationPath
    ? await backupSqliteDatabase(backupOptions)
    : await backupCompressedSqliteDatabase(backupOptions);
  if (options.destinationPath) {
    verifySqliteDatabaseFile(result.destinationPath);
  }
  const extraBackup = options.destinationPath
    ? disabledExtraBackupResult()
    : await copyExtraBackup({
        disposeFile: moveManagedBackupToTrash,
        extraBackupDir: settings.extra_backup_dir,
        maxCount: settings.extra_backup_max_count,
        primaryBackupDir: backupDirectory,
        sourcePath: result.destinationPath
      });
  if (!options.destinationPath) {
    const sidecarCleanup = await cleanupOrphanedBackupSidecars(backupDirectory);
    reportSidecarCleanup(sidecarCleanup);
    await pruneBackupsNow();
    return { ...result, extraBackup, sidecarCleanup };
  }
  return {
    ...result,
    extraBackup,
    sidecarCleanup: { deletedCount: 0, failedCount: 0, releasedBytes: 0 }
  };
}

function reportSidecarCleanup(result: Awaited<ReturnType<typeof cleanupOrphanedBackupSidecars>>) {
  if (result.deletedCount === 0 && result.failedCount === 0) return;
  console.info('[backup] retired orphaned legacy SQLite sidecars', result);
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
    return await runWithDatabaseConnectionMaintenance(() =>
      restoreDatabaseBackupInMaintenance(options.sourcePath));
  } finally {
    resumeLibraryTasks?.();
    restoreInProgress = false;
  }
}

export async function listApplicationDatabaseBackups(): Promise<ApplicationDatabaseBackupEntry[]> {
  await waitForManagedSafetySnapshotSettlements();
  return listManagedDatabaseBackups(resolveManagedBackupDirectory());
}

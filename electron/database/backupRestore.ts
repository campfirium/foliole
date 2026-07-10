import path from 'node:path';

import {
  listManagedDatabaseBackups,
  pruneManagedDatabaseBackups,
  type ApplicationDatabaseBackupEntry
} from './backupCatalog.js';
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

const AUTO_FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'] as const;
type AutoFrequency = (typeof AUTO_FREQUENCIES)[number];

export type { ApplicationDatabaseBackupEntry } from './backupCatalog.js';

function backupFileTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function buildManagedBackupPath(prefix: string, now: Date, backupDirectory = resolveManagedBackupDirectory()) {
  return path.join(backupDirectory, `${prefix}-${backupFileTimestamp(now)}.db`);
}

function startOfUtcHour(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours());
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay();
  const distance = (day + 6) % 7;
  return startOfUtcDay(new Date(startOfUtcDay(date) - distance * 24 * 60 * 60 * 1000));
}

function startOfUtcMonth(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function resolveFrequencyBucket(now: Date, frequency: AutoFrequency) {
  if (frequency === 'hourly') {
    return new Date(startOfUtcHour(now)).toISOString();
  }
  if (frequency === 'daily') {
    return new Date(startOfUtcDay(now)).toISOString();
  }
  if (frequency === 'weekly') {
    return new Date(startOfUtcWeek(now)).toISOString();
  }
  return new Date(startOfUtcMonth(now)).toISOString();
}

function isAutoFrequencyEnabled(frequency: AutoFrequency, settings = loadBackupSettings()) {
  if (frequency === 'hourly') {
    return settings.auto_hourly_hours > 0;
  }
  if (frequency === 'daily') {
    return settings.auto_daily_days > 0;
  }
  if (frequency === 'weekly') {
    return settings.auto_weekly_weeks > 0;
  }
  return settings.auto_monthly_months > 0;
}

async function pruneBackupsNow(now = new Date()) {
  const settings = loadBackupSettings();
  await pruneManagedDatabaseBackups(resolveManagedBackupDirectory(settings), settings, now);
}

async function createAutomaticBackupForFrequency(frequency: AutoFrequency, now: Date) {
  const settings = loadBackupSettings();
  const backupDirectory = resolveManagedBackupDirectory(settings);
  const connection = openDatabaseConnection();
  const result = await backupSqliteDatabase({
    destinationPath: buildManagedBackupPath(`auto-${frequency}`, now, backupDirectory),
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
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

  for (const frequency of AUTO_FREQUENCIES) {
    if (!isAutoFrequencyEnabled(frequency, settings)) {
      continue;
    }
    const currentBucket = resolveFrequencyBucket(now, frequency);
    const alreadyExists = existingEntries.some(
      (entry) =>
        entry.kind === 'automatic' &&
        entry.autoFrequency === frequency &&
        resolveFrequencyBucket(new Date(entry.updatedAt), frequency) === currentBucket
    );
    if (!alreadyExists) {
      await createAutomaticBackupForFrequency(frequency, now);
    }
  }

  await pruneManagedDatabaseBackups(backupDirectory, settings, now);
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

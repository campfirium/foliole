import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { ensureManagedBackupDirectory, resolveManagedBackupDirectory } from './backupSettings.js';
import type { SqliteDatabase } from './connection.js';
import { backupSqliteDatabase } from './sqliteBackupRestore.js';

export const INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT = 5;

type InternalDatabaseSnapshotReason = 'pre-cleanup' | 'pre-migration' | 'pre-restore';

export interface InternalDatabaseSnapshotResult {
  destinationPath: string;
  reason: InternalDatabaseSnapshotReason;
  sourcePath: string;
}

export interface CreateInternalDatabaseSnapshotOptions {
  destinationDirectory?: string;
  now?: Date;
  reason: InternalDatabaseSnapshotReason;
  retentionLimit?: number;
  sourceDatabase: SqliteDatabase;
  sourcePath: string;
}

export function buildInternalDatabaseSnapshotPath({
  destinationDirectory,
  now = new Date(),
  reason,
  sourcePath
}: Pick<CreateInternalDatabaseSnapshotOptions, 'destinationDirectory' | 'now' | 'reason' | 'sourcePath'>) {
  const resolvedSourcePath = path.resolve(sourcePath);
  const resolvedDestinationDirectory = destinationDirectory
    ? path.resolve(destinationDirectory)
    : resolveInternalDatabaseSnapshotDirectory(resolvedSourcePath);
  return path.join(resolvedDestinationDirectory, `${reason}-${snapshotTimestamp(now)}.db`);
}

export function resolveInternalDatabaseSnapshotDirectory(sourcePath: string) {
  void sourcePath;
  return resolveManagedBackupDirectory();
}

export function createInternalDatabaseSnapshot({
  destinationDirectory,
  now = new Date(),
  reason,
  retentionLimit = INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT,
  sourceDatabase,
  sourcePath
}: CreateInternalDatabaseSnapshotOptions): InternalDatabaseSnapshotResult {
  const resolvedSourcePath = path.resolve(sourcePath);
  const destinationPath = buildInternalDatabaseSnapshotPath({
    ...(destinationDirectory ? { destinationDirectory } : {}), now, reason, sourcePath
  });
  const resolvedDestinationDirectory = path.dirname(destinationPath);

  try {
    if (destinationDirectory) {
      fs.mkdirSync(resolvedDestinationDirectory, { recursive: true });
    } else {
      ensureManagedBackupDirectory();
    }
    sourceDatabase.exec(`VACUUM INTO ${toSqliteStringLiteral(destinationPath)}`);
    if (!destinationDirectory && reason === 'pre-cleanup') {
      pruneInternalDatabaseSnapshots(resolvedSourcePath, retentionLimit);
    }
  } catch (error) {
    throw new Error(
      `failed to create ${reason} snapshot at ${destinationPath}: ${formatErrorMessage(error)}`
    );
  }

  return {
    destinationPath,
    reason,
    sourcePath: resolvedSourcePath
  };
}

export async function createInternalDatabaseSnapshotWithBackup({
  destinationDirectory,
  now = new Date(),
  reason,
  retentionLimit = INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT,
  sourceDatabase,
  sourcePath
}: CreateInternalDatabaseSnapshotOptions): Promise<InternalDatabaseSnapshotResult> {
  const resolvedSourcePath = path.resolve(sourcePath);
  const destinationPath = buildInternalDatabaseSnapshotPath({
    ...(destinationDirectory ? { destinationDirectory } : {}), now, reason, sourcePath
  });

  try {
    await backupSqliteDatabase({
      destinationPath,
      sourceDatabase,
      sourcePath: resolvedSourcePath
    });
    if (!destinationDirectory && reason === 'pre-cleanup') {
      await pruneInternalDatabaseSnapshotsAsync(resolvedSourcePath, retentionLimit);
    }
  } catch (error) {
    throw new Error(
      `failed to create ${reason} snapshot at ${destinationPath}: ${formatErrorMessage(error)}`
    );
  }

  return {
    destinationPath,
    reason,
    sourcePath: resolvedSourcePath
  };
}

function pruneInternalDatabaseSnapshots(sourcePath: string, retentionLimit = INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT) {
  const snapshotDirectory = resolveInternalDatabaseSnapshotDirectory(sourcePath);
  const snapshotEntries = fs
    .readdirSync(snapshotDirectory)
    .filter((fileName) => fileName.endsWith('.db') && fileName.startsWith('pre-cleanup-'))
    .map((fileName) => {
      const filePath = path.join(snapshotDirectory, fileName);
      const stats = fs.statSync(filePath);
      return {
        filePath,
        updatedAtMs: stats.mtimeMs
      };
    })
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs);

  for (const entry of snapshotEntries.slice(Math.max(1, retentionLimit))) {
    fs.rmSync(entry.filePath, { force: true });
  }
}

async function pruneInternalDatabaseSnapshotsAsync(
  sourcePath: string,
  retentionLimit = INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT
) {
  const snapshotDirectory = resolveInternalDatabaseSnapshotDirectory(sourcePath);
  const fileNames = await fsPromises.readdir(snapshotDirectory);
  const snapshotEntries = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.db') && fileName.startsWith('pre-cleanup-'))
      .map(async (fileName) => {
        const filePath = path.join(snapshotDirectory, fileName);
        const stats = await fsPromises.stat(filePath);
        return {
          filePath,
          updatedAtMs: stats.mtimeMs
        };
      })
  );
  snapshotEntries.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
  await Promise.all(
    snapshotEntries.slice(Math.max(1, retentionLimit)).map((entry) => fsPromises.rm(entry.filePath, { force: true }))
  );
}

function snapshotTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function toSqliteStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

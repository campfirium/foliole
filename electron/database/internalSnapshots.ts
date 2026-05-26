import fs from 'node:fs';
import path from 'node:path';

import { ensureManagedBackupDirectory, resolveManagedBackupDirectory } from './backupSettings.js';
import type { SqliteDatabase } from './connection.js';

export const INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT = 5;

export type InternalDatabaseSnapshotReason = 'pre-cleanup' | 'pre-migration' | 'pre-restore';

export interface InternalDatabaseSnapshotResult {
  destinationPath: string;
  reason: InternalDatabaseSnapshotReason;
  sourcePath: string;
}

export interface CreateInternalDatabaseSnapshotOptions {
  now?: Date;
  reason: InternalDatabaseSnapshotReason;
  retentionLimit?: number;
  sourceDatabase: SqliteDatabase;
  sourcePath: string;
}

export function resolveInternalDatabaseSnapshotDirectory(sourcePath: string) {
  void sourcePath;
  return resolveManagedBackupDirectory();
}

export function createInternalDatabaseSnapshot({
  now = new Date(),
  reason,
  retentionLimit = INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT,
  sourceDatabase,
  sourcePath
}: CreateInternalDatabaseSnapshotOptions): InternalDatabaseSnapshotResult {
  const resolvedSourcePath = path.resolve(sourcePath);
  const destinationPath = path.join(
    resolveInternalDatabaseSnapshotDirectory(resolvedSourcePath),
    `${reason}-${snapshotTimestamp(now)}.db`
  );

  try {
    ensureManagedBackupDirectory();
    sourceDatabase.exec(`VACUUM INTO ${toSqliteStringLiteral(destinationPath)}`);
    pruneInternalDatabaseSnapshots(resolvedSourcePath, retentionLimit);
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

export function pruneInternalDatabaseSnapshots(sourcePath: string, retentionLimit = INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT) {
  const snapshotDirectory = resolveInternalDatabaseSnapshotDirectory(sourcePath);
  const snapshotEntries = fs
    .readdirSync(snapshotDirectory)
    .filter((fileName) => fileName.endsWith('.db') && /^pre-(?:cleanup|migration|restore)-/.test(fileName))
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

function snapshotTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function toSqliteStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

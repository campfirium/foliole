import fs from 'node:fs';
import path from 'node:path';

import type { SqliteDatabase } from './connection.js';

export const INTERNAL_DATABASE_SNAPSHOT_DIRECTORY_NAME = 'snapshots';
export const INTERNAL_DATABASE_SNAPSHOT_RETENTION_LIMIT = 5;

export type InternalDatabaseSnapshotReason = 'pre-migration' | 'pre-restore';

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
  const databasePath = path.resolve(sourcePath);
  return path.join(path.dirname(databasePath), INTERNAL_DATABASE_SNAPSHOT_DIRECTORY_NAME);
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
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
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
    .map((fileName) => {
      const filePath = path.join(snapshotDirectory, fileName);
      const stats = fs.statSync(filePath);
      if (!stats.isFile() || !fileName.endsWith('.db')) {
        return null;
      }
      return {
        filePath,
        updatedAtMs: stats.mtimeMs
      };
    })
    .filter((entry): entry is { filePath: string; updatedAtMs: number } => entry !== null)
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

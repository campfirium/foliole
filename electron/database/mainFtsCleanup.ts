import { createInternalDatabaseSnapshot, type InternalDatabaseSnapshotResult } from './internalSnapshots.js';
import {
  cleanupLegacyMainFtsTables,
  listLegacyMainFtsObjectNames
} from './mainFtsCleanupCore.js';

type SqliteDatabase = import('better-sqlite3').Database;

export { listLegacyMainFtsObjectNames };

export interface CleanupMainFtsOptions {
  now?: Date;
  snapshotDirectory?: string;
  sourceDatabase: SqliteDatabase;
  sourcePath: string;
  vacuum?: boolean;
}

export interface CleanupMainFtsResult {
  droppedTables: string[];
  legacyObjectNamesAfter: string[];
  legacyObjectNamesBefore: string[];
  pageCountAfterVacuum: number | null;
  pageCountBeforeVacuum: number | null;
  snapshot: InternalDatabaseSnapshotResult | null;
  status: 'already-clean' | 'cleaned';
  vacuumed: boolean;
}

export function cleanupMainFtsTables({
  now,
  snapshotDirectory,
  sourceDatabase,
  sourcePath,
  vacuum = true
}: CleanupMainFtsOptions): CleanupMainFtsResult {
  return cleanupLegacyMainFtsTables<InternalDatabaseSnapshotResult>({
    createSnapshot: () => createInternalDatabaseSnapshot({
      ...(snapshotDirectory ? { destinationDirectory: snapshotDirectory } : {}),
      ...(now ? { now } : {}),
      reason: 'pre-cleanup',
      sourceDatabase,
      sourcePath
    }),
    sourceDatabase,
    vacuum
  });
}

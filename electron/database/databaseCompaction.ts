import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import type {
  NativeDatabaseCompactionResult,
  NativeDatabaseSpaceStatus
} from '../../lib/platform/nativeDatabaseCompactionContract.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

import { discardRestoreSafetySnapshot, settleRestoreSafetySnapshots } from './backupSafetyRetention.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection,
  openDatabaseConnection,
  runWithDatabaseConnectionMaintenance,
  type SqliteDatabase
} from './connection.js';
import { recoverCurrentDatabaseAfterRestoreFailure } from './databaseRestoreRecovery.js';
import { createManagedSafetySnapshotWithBackup, type ManagedSafetySnapshot } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { restoreSqliteDatabase, verifySqliteDatabaseFile } from './sqliteBackupRestore.js';

let compactionInProgress = false;

export async function loadApplicationDatabaseSpaceStatus(): Promise<NativeDatabaseSpaceStatus> {
  const connection = openDatabaseConnection();
  return readDatabaseSpaceStatus(connection.sqlite, connection.dbPath);
}

export async function compactApplicationDatabase(): Promise<NativeDatabaseCompactionResult> {
  if (compactionInProgress) throw new Error('Database compaction is already in progress.');
  compactionInProgress = true;
  let resumeLibraryTasks: (() => void) | null = null;
  try {
    resumeLibraryTasks = await desktopTaskScheduler.pauseResource('library');
    return await runWithDatabaseConnectionMaintenance(compactDatabaseInMaintenance);
  } finally {
    resumeLibraryTasks?.();
    compactionInProgress = false;
  }
}

export async function compactDatabaseInMaintenance(): Promise<NativeDatabaseCompactionResult> {
  const connection = openDatabaseConnection();
  const targetPath = connection.dbPath;
  const candidatePath = path.join(path.dirname(targetPath), `.foliole-compact-${randomUUID()}.db`);
  const before = await readDatabaseSpaceStatus(connection.sqlite, targetPath);
  let safetySnapshot: ManagedSafetySnapshot | null = null;
  let connectionClosed = false;
  let replacementComplete = false;
  try {
    safetySnapshot = await createManagedSafetySnapshotWithBackup({
      reason: 'pre-compact', sourceDatabase: connection.sqlite, sourcePath: targetPath
    });
    connection.sqlite.exec(`VACUUM main INTO ${toSqliteStringLiteral(candidatePath)}`);
    verifySqliteDatabaseFile(candidatePath);
    closeDatabaseConnection();
    connectionClosed = true;
    await restoreSqliteDatabase({ sourcePath: candidatePath, targetPath });
    replacementComplete = true;
    initializeWorkspaceSearchSidecar(initializeDatabase(), { requireCurrentSource: true });
    clearDatabaseConnectionUnavailable();
    const afterConnection = openDatabaseConnection();
    const after = await readDatabaseSpaceStatus(afterConnection.sqlite, targetPath);
    return { after, before, safety_snapshot_path: safetySnapshot.currentPath };
  } catch (error) {
    if (!connectionClosed || !safetySnapshot) {
      throw new Error('The database was not compacted. Your current library is unchanged.');
    }
    await recoverCurrentDatabaseAfterRestoreFailure({
      error, replacementComplete, safetySnapshot, targetPath
    });
    throw new Error('The database was not compacted. Your current library has been restored.');
  } finally {
    await fs.rm(candidatePath, { force: true });
    if (safetySnapshot) {
      if (replacementComplete) await settleRestoreSafetySnapshots(safetySnapshot, safetySnapshot.currentPath);
      else await discardRestoreSafetySnapshot(safetySnapshot);
    }
  }
}

export async function readDatabaseSpaceStatus(
  sqlite: SqliteDatabase,
  databasePath: string
): Promise<NativeDatabaseSpaceStatus> {
  const pageSize = readPragmaNumber(sqlite, 'page_size');
  const freePages = readPragmaNumber(sqlite, 'freelist_count');
  const databaseSizeBytes = (await fs.stat(databasePath)).size;
  const reclaimableBytes = Math.min(databaseSizeBytes, freePages * pageSize);
  return {
    database_size_bytes: databaseSizeBytes,
    reclaimable_bytes: reclaimableBytes,
    reclaimable_percent: databaseSizeBytes === 0 ? 0 : reclaimableBytes / databaseSizeBytes * 100
  };
}

function readPragmaNumber(sqlite: SqliteDatabase, pragma: string) {
  const value = sqlite.pragma(pragma, { simple: true });
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`SQLite returned an invalid ${pragma}.`);
  }
  return value;
}

function toSqliteStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

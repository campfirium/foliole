import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

import {
  discardRestoreSafetySnapshot,
  settleRestoreSafetySnapshots
} from './backupSafetyRetention.js';
import {
  loadBackupSettings,
  reapplyBackupSettingsAfterRestore,
  resolveManagedBackupDirectory
} from './backupSettings.js';
import { materializeCompressedSqliteBackup } from './compressedSqliteBackup.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection,
  openDatabaseConnection
} from './connection.js';
import { recoverCurrentDatabaseAfterRestoreFailure } from './databaseRestoreRecovery.js';
import {
  createManagedSafetySnapshotWithBackup,
  type ManagedSafetySnapshot
} from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import {
  restoreSqliteDatabase,
  verifySqliteDatabaseFile,
  type SqliteRestoreResult
} from './sqliteBackupRestore.js';

export async function restoreDatabaseBackupInMaintenance(
  sourcePath: string
): Promise<SqliteRestoreResult> {
  const connection = openDatabaseConnection();
  const targetPath = connection.dbPath;
  const backupSettings = loadBackupSettings();
  const backupDirectory = resolveManagedBackupDirectory(backupSettings);
  let materialized: Awaited<ReturnType<typeof materializeCompressedSqliteBackup>> | null = null;
  let safetySnapshot: ManagedSafetySnapshot | null = null;
  let connectionClosed = false;
  let replacementComplete = false;
  try {
    materialized = await materializeCompressedSqliteBackup(sourcePath, path.dirname(targetPath));
    verifySqliteDatabaseFile(materialized.databasePath);
    safetySnapshot = await createManagedSafetySnapshotWithBackup({
      destinationDirectory: backupDirectory,
      reason: 'pre-restore',
      sourceDatabase: connection.sqlite,
      sourcePath: targetPath
    });
    closeDatabaseConnection();
    connectionClosed = true;
    const result = await restoreSqliteDatabase({ sourcePath: materialized.databasePath, targetPath });
    replacementComplete = true;
    initializeWorkspaceSearchSidecar(initializeDatabase(), { requireCurrentSource: true });
    reapplyBackupSettingsAfterRestore(backupSettings);
    clearDatabaseConnectionUnavailable();
    return { ...result, sourcePath: path.resolve(sourcePath) };
  } catch (error) {
    if (!connectionClosed || !safetySnapshot) {
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
    if (safetySnapshot) {
      if (replacementComplete) {
        await settleRestoreSafetySnapshots(safetySnapshot, sourcePath, {
          backupDirectory,
          settings: backupSettings
        });
      } else {
        await discardRestoreSafetySnapshot(safetySnapshot);
      }
    }
  }
}

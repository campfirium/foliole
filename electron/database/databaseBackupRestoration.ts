import path from 'node:path';

import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

import {
  loadBackupSettings,
  reapplyBackupSettingsAfterRestore,
  resolveManagedBackupDirectory
} from './backupSettings.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection,
  openDatabaseConnection
} from './connection.js';
import { createDatabaseRestoreArtifacts } from './databaseRestoreArtifacts.js';
import { recoverCurrentDatabaseAfterRestoreFailure } from './databaseRestoreRecovery.js';
import {
  createManagedSafetySnapshotWithBackup,
  type ManagedSafetySnapshot
} from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { startSearchAliasMirror } from './searchAliasMirror.js';
import {
  restoreSqliteDatabase,
  verifySqliteDatabaseFile,
  type SqliteRestoreResult
} from './sqliteBackupRestore.js';
import {
  captureCurrentSyncGroupForBackupRestore,
  finishSyncGroupBackupRestore
} from './syncGroupBackupRestore.js';

export async function restoreDatabaseBackupInMaintenance(
  sourcePath: string, restoredAt = new Date().toISOString()
): Promise<SqliteRestoreResult> {
  const connection = openDatabaseConnection();
  const syncGroup = captureCurrentSyncGroupForBackupRestore(connection.driver);
  const targetPath = connection.dbPath;
  const backupSettings = loadBackupSettings();
  const backupDirectory = resolveManagedBackupDirectory(backupSettings);
  const artifacts = createDatabaseRestoreArtifacts();
  let safetySnapshot: ManagedSafetySnapshot | null = null;
  let connectionClosed = false;
  let replacementComplete = false;
  try {
    const databasePath = await artifacts.materialize(sourcePath, path.dirname(targetPath));
    verifySqliteDatabaseFile(databasePath);
    safetySnapshot = await createManagedSafetySnapshotWithBackup({
      destinationDirectory: backupDirectory,
      reason: 'pre-restore',
      sourceDatabase: connection.sqlite,
      sourcePath: targetPath
    });
    closeDatabaseConnection();
    connectionClosed = true;
    const result = await restoreSqliteDatabase({
      sourcePath: databasePath, targetPath, onTemporaryDatabase: artifacts.trackCandidate
    });
    replacementComplete = true;
    const restored = initializeDatabase();
    finishSyncGroupBackupRestore(restored.driver, syncGroup, restoredAt);
    initializeWorkspaceSearchSidecar(restored, { requireCurrentSource: true });
    reapplyBackupSettingsAfterRestore(backupSettings);
    await startSearchAliasMirror('restore');
    clearDatabaseConnectionUnavailable();
    return { ...result, sourcePath: path.resolve(sourcePath) };
  } catch (error) {
    if (!connectionClosed || !safetySnapshot) {
      console.error('[backup] restore failed before database replacement', error);
      throw new Error('The selected backup was not restored. Your current library is unchanged.');
    }
    await recoverCurrentDatabaseAfterRestoreFailure({
      artifacts,
      error,
      replacementComplete,
      safetySnapshot,
      targetPath
    });
    await startSearchAliasMirror();
    throw new Error('The selected backup was not restored. Your current library has been restored.');
  } finally {
    await artifacts.finish({
      backupDirectory, replacementComplete, settings: backupSettings,
      snapshot: safetySnapshot, sourcePath
    });
  }
}

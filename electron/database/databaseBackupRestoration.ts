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
import { createDatabaseRestoreArtifacts, type DatabaseRestoreArtifacts } from './databaseRestoreArtifacts.js';
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
    const restored = initializeDatabase(undefined, { recovery: 'fail' });
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
    await resumeRecoveredSearchAliasMirror();
    throw new Error('The selected backup was not restored. Your current library has been restored.');
  } finally {
    await finishRestoreArtifacts(artifacts, {
      backupDirectory, replacementComplete, settings: backupSettings,
      snapshot: safetySnapshot, sourcePath
    });
  }
}

async function resumeRecoveredSearchAliasMirror() {
  await startSearchAliasMirror().catch((error) => {
    console.error('[backup] current library recovered but search alias watcher could not restart', error);
  });
}

async function finishRestoreArtifacts(artifacts: DatabaseRestoreArtifacts,
  args: Parameters<DatabaseRestoreArtifacts['finish']>[0]) {
  await artifacts.finish(args).catch((error) => {
    artifacts.preserve();
    args.snapshot?.release();
    console.error('[backup] restore outcome preserved; temporary cleanup failed', error);
  });
}

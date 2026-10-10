import path from 'node:path';

import { readForegroundTimePreservation } from '../../lib/core/database/foregroundTimeRestore.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import type { BackupRestoreSyncChoice } from '../../lib/platform/backupRestoreSyncContract.js';

import { retainReadwiseOwnerAfterBackupRestore } from './backupRestoreReadwiseOwner.js';
import { snapshotBackupRestoreSource } from './backupRestoreSourceSnapshot.js';
import { selectBackupRestoreSync, finishLocalOnlyBackupRestore } from './backupRestoreSyncSelection.js';
import {
  loadBackupSettings,
  reapplyBackupSettingsAfterRestore,
  resolveManagedBackupDirectory
} from './backupSettings.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import {
  clearDatabaseConnectionUnavailable,
  closeDatabaseConnection,
  openDatabaseConnection
} from './connection.js';
import { createDatabaseRestoreArtifacts, type DatabaseRestoreArtifacts } from './databaseRestoreArtifacts.js';
import { recoverCurrentDatabaseAfterRestoreFailure } from './databaseRestoreRecovery.js';
import { prepareForegroundTimeBackupCandidate } from './foregroundTimeBackupCandidate.js';
import { withDesktopForegroundTimeMaintenance } from './foregroundTimeMaintenance.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import {
  createManagedSafetySnapshotWithBackup,
  type ManagedSafetySnapshot
} from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import { loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
import { startSearchAliasMirror } from './searchAliasMirror.js';
import {
  restoreSqliteDatabase,
  verifySqliteDatabaseFile,
  type SqliteRestoreResult
} from './sqliteBackupRestore.js';
import {
  finishSyncGroupBackupRestore
} from './syncGroupBackupRestore.js';

export async function restoreDatabaseBackupInMaintenance(
  sourcePath: string, restoredAt = new Date().toISOString(), choice?: BackupRestoreSyncChoice
): Promise<SqliteRestoreResult> {
  return withDesktopForegroundTimeMaintenance(() => restoreBackup(sourcePath, restoredAt, choice));
}

async function restoreBackup(sourcePath: string, restoredAt: string, choice?: BackupRestoreSyncChoice): Promise<SqliteRestoreResult> {
  const connection = openDatabaseConnection();
  const foregroundTime = await readForegroundTimePreservation(createBetterSqliteDbPort(connection.sqlite));
  const targetPath = connection.dbPath;
  const wasLocalReadwiseOwner = loadReadwiseHostAssignment().is_active;
  const backupSettings = loadBackupSettings();
  const backupDirectory = resolveManagedBackupDirectory(backupSettings);
  const artifacts = createDatabaseRestoreArtifacts();
  let safetySnapshot: ManagedSafetySnapshot | null = null;
  let connectionClosed = false;
  let replacementComplete = false;
  try {
    const databasePath = await snapshotBackupRestoreSource(artifacts, sourcePath, path.dirname(targetPath));
    verifySqliteDatabaseFile(databasePath);
    const selection = await selectBackupRestoreSync({ sourcePath, databasePath,
      targetPath, current: connection.driver, ...(choice ? { choice } : {}) });
    await prepareForegroundTimeBackupCandidate(databasePath, foregroundTime, loadOrCreateDesktopHostName());
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
    if (selection.snapshot) finishSyncGroupBackupRestore(restored.driver, selection.snapshot, restoredAt,
      selection.mode === 'pause' ? 'pause' : 'overwrite');
    else finishLocalOnlyBackupRestore(restored.driver, selection.host);
    initializeWorkspaceSearchSidecar(restored, { requireCurrentSource: true });
    reapplyBackupSettingsAfterRestore(backupSettings);
    await startSearchAliasMirror('restore');
    retainReadwiseOwnerAfterBackupRestore(wasLocalReadwiseOwner);
    clearDatabaseConnectionUnavailable();
    return { ...result, sourcePath: path.resolve(sourcePath) };
  } catch (error) {
    if (!connectionClosed || !safetySnapshot) {
      console.error('[backup] restore failed before database replacement', error);
      throw restoreFailure('unchanged', error);
    }
    await recoverCurrentDatabaseAfterRestoreFailure({
      artifacts,
      error,
      replacementComplete,
      safetySnapshot,
      targetPath
    });
    await resumeRecoveredSearchAliasMirror();
    throw restoreFailure('restored', error);
  } finally {
    await finishRestoreArtifacts(artifacts, {
      backupDirectory, replacementComplete, settings: backupSettings,
      snapshot: safetySnapshot, sourcePath
    });
  }
}

function restoreFailure(state: 'unchanged' | 'restored', error: unknown) {
  const outcome = state === 'unchanged' ? 'is unchanged' : 'has been restored';
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`The selected backup was not restored. Your current library ${outcome}.\nReason: ${reason}`);
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

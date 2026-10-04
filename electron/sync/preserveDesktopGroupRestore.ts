import { loadBackupSettings, resolveManagedBackupDirectory } from '../database/backupSettings.js';
import { openDatabaseConnection } from '../database/connection.js';
import { createManagedSafetySnapshotWithBackup } from '../database/managedSafetySnapshots.js';
import { loadDesktopSyncGroupRestoreState } from '../database/syncGroupRestoreState.js';

export async function preserveDesktopGroupRestore(groupId: string, restoreId: string | undefined,
  manifest: { dependencyPage?: unknown; toStateSeq: number; frontierStateSeq: number }) {
  if (!restoreId || manifest.dependencyPage || manifest.toStateSeq !== manifest.frontierStateSeq) return;
  await preserveDesktopIdentityRestore(groupId, restoreId);
}

/** Preserve the receiver's current library before the complete identity replacement. */
export async function preserveDesktopIdentityRestore(groupId: string, restoreId: string) {
  const connection = openDatabaseConnection();
  const restore = loadDesktopSyncGroupRestoreState(connection.driver, groupId);
  if (!restore || restore.applied || restore.event.restore_id !== restoreId) return;
  const snapshot = await createManagedSafetySnapshotWithBackup({
    destinationDirectory: resolveManagedBackupDirectory(loadBackupSettings()), reason: 'pre-restore',
    sourceDatabase: connection.sqlite, sourcePath: connection.dbPath
  });
  snapshot.release();
}

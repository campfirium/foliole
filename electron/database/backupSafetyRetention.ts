import path from 'node:path';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { listManagedDatabaseBackups } from './backupCatalog.js';
import { moveManagedBackupToTrash } from './backupFileDisposition.js';
import { loadBackupSettings, resolveManagedBackupDirectory } from './backupSettings.js';
import {
  isManagedSafetySnapshotProtected,
  type ManagedSafetySnapshot,
  waitForManagedSafetySnapshotSettlements
} from './managedSafetySnapshots.js';

export async function discardRestoreSafetySnapshot(snapshot: ManagedSafetySnapshot) {
  snapshot.release();
  try {
    await moveManagedBackupToTrash(snapshot.currentPath);
  } catch (error) {
    console.error('[backup] could not move unused restore safety snapshot to trash', error);
  }
}

export async function settleRestoreSafetySnapshots(
  snapshot: ManagedSafetySnapshot,
  restoreSourcePath: string,
  context?: { backupDirectory: string; settings: NativeBackupSettings }
) {
  snapshot.release();
  await waitForManagedSafetySnapshotSettlements();
  try {
    const settings = context?.settings ?? loadBackupSettings();
    const backupDirectory = context?.backupDirectory ?? resolveManagedBackupDirectory(settings);
    const entries = await listManagedDatabaseBackups(backupDirectory);
    const retained = new Set(entries
      .filter((entry) => entry.kind === 'snapshot')
      .slice(0, settings.safety_max_count)
      .map((entry) => entry.filePath));
    const resolvedSourcePath = path.resolve(restoreSourcePath);
    const expired = entries.filter((entry) =>
      entry.kind === 'snapshot' &&
      !retained.has(entry.filePath) &&
      path.resolve(entry.filePath) !== resolvedSourcePath &&
      !isManagedSafetySnapshotProtected(entry.filePath));
    await Promise.all(expired.map((entry) => moveSafetySnapshotToTrash(entry.filePath)));
  } catch (error) {
    console.error('[backup] could not settle restore safety snapshots', error);
  }
}

async function moveSafetySnapshotToTrash(filePath: string) {
  try {
    await moveManagedBackupToTrash(filePath);
  } catch (error) {
    console.error('[backup] could not move expired safety snapshot to trash', { error, filePath });
  }
}

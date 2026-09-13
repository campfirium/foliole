import path from 'node:path';

import type {
  NativeBackupRetentionStatus,
  NativeBackupSettings
} from '../../lib/platform/nativeUtilityContract.js';

import {
  listManagedDatabaseBackups,
  type BackupPruneResult
} from './backupCatalog.js';
import { selectOrdinaryRestorePoints } from './backupRetentionPolicy.js';
import { resolveManagedBackupDirectory } from './backupSettings.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';

let lastCleanup: {
  directoryPath: string;
  status: NonNullable<NativeBackupRetentionStatus['lastCleanup']>;
} | null = null;

export function recordBackupCleanup(directoryPath: string, result: BackupPruneResult) {
  lastCleanup = {
    directoryPath: path.resolve(directoryPath),
    status: {
      failedCount: result.failedCount,
      movedToTrashCount: result.deletedCount,
      remainingBytesOverLimit: result.remainingBytesOverLimit ?? 0
    }
  };
}

export async function loadBackupRetentionStatus(
  settings: NativeBackupSettings
): Promise<NativeBackupRetentionStatus> {
  await waitForManagedSafetySnapshotSettlements();
  const directoryPath = resolveManagedBackupDirectory(settings);
  const entries = await listManagedDatabaseBackups(directoryPath);
  const ordinary = entries.filter((entry) => entry.kind === 'automatic' || entry.kind === 'manual');
  const selected = selectOrdinaryRestorePoints(ordinary, settings);
  return {
    counts: {
      hourly: selected.hourly.length,
      daily: selected.daily.length,
      weekly: selected.weekly.length,
      monthly: selected.monthly.length
    },
    lastCleanup: lastCleanup?.directoryPath === path.resolve(directoryPath) ? lastCleanup.status : null,
    safetyCount: entries.filter((entry) => entry.kind === 'snapshot').length,
    totalSizeBytes: entries.reduce((total, entry) => total + entry.sizeBytes, 0)
  };
}

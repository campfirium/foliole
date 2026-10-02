import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { listManagedDatabaseBackups, type ApplicationDatabaseBackupEntry,
  type BackupPruneOptions, type BackupPruneResult } from './backupCatalog.js';
import { forgetManagedBackup, reconcileBackupManagement } from './backupManagement.js';
import { frequencyBucketKey, selectOrdinaryRestorePoints, type RestorePointsByTier } from './backupRetentionPolicy.js';
import { isManagedSafetySnapshotProtected } from './managedSafetySnapshots.js';

function selectCapacityRetainedPaths(
  entries: ApplicationDatabaseBackupEntry[],
  protectedEntries: ApplicationDatabaseBackupEntry[],
  selectedSafety: ApplicationDatabaseBackupEntry[],
  ordinaryEntries: ApplicationDatabaseBackupEntry[],
  selectedOrdinary: RestorePointsByTier,
  settings: NativeBackupSettings
) {
  const retainedPaths = new Set(protectedEntries.map((entry) => entry.filePath));
  selectedSafety.forEach((entry) => retainedPaths.add(entry.filePath));
  const latestOrdinary = ordinaryEntries[0];
  if (latestOrdinary) retainedPaths.add(latestOrdinary.filePath);
  let retainedBytes = entries
    .filter((entry) => retainedPaths.has(entry.filePath) && !isManagedSafetySnapshotProtected(entry.filePath))
    .reduce((total, entry) => total + entry.sizeBytes, 0);
  for (const tier of settings.retention_priority) {
    for (const entry of selectedOrdinary[tier]) {
      const bucket = frequencyBucketKey(new Date(entry.updatedAt), tier);
      const coveredForFree = ordinaryEntries.some((candidate) =>
        retainedPaths.has(candidate.filePath) &&
        frequencyBucketKey(new Date(candidate.updatedAt), tier) === bucket);
      if (coveredForFree) continue;
      if (settings.total_size_limit_bytes > 0 && retainedBytes + entry.sizeBytes > settings.total_size_limit_bytes) {
        break;
      }
      retainedPaths.add(entry.filePath);
      retainedBytes += entry.sizeBytes;
    }
  }
  return retainedPaths;
}

function selectPruningCandidates(entries: ApplicationDatabaseBackupEntry[], settings: NativeBackupSettings) {
  const protectedEntries = entries.filter((entry) => isManagedSafetySnapshotProtected(entry.filePath));
  const safetyEntries = entries.filter((entry) =>
    entry.kind === 'snapshot' && !isManagedSafetySnapshotProtected(entry.filePath));
  const selectedSafety = safetyEntries.slice(0, settings.safety_max_count);
  const ordinaryEntries = entries.filter((entry) => entry.kind === 'automatic' || entry.kind === 'manual');
  const selectedOrdinary = selectOrdinaryRestorePoints(ordinaryEntries, settings);
  const latestOrdinary = ordinaryEntries[0];
  const desiredPaths = new Set([
    ...protectedEntries.map((entry) => entry.filePath),
    ...selectedSafety.map((entry) => entry.filePath),
    ...Object.values(selectedOrdinary).flat().map((entry) => entry.filePath)
  ]);
  if (latestOrdinary) desiredPaths.add(latestOrdinary.filePath);

  const retainedPaths = selectCapacityRetainedPaths(
    entries,
    protectedEntries,
    selectedSafety,
    ordinaryEntries,
    selectedOrdinary,
    settings
  );

  const policyDeleted = entries.filter((entry) =>
    !desiredPaths.has(entry.filePath) && !isManagedSafetySnapshotProtected(entry.filePath));
  const capacityDeleted = entries.filter((entry) =>
    desiredPaths.has(entry.filePath) && !retainedPaths.has(entry.filePath) &&
    !isManagedSafetySnapshotProtected(entry.filePath));
  return { policyDeleted, capacityDeleted, selectedSafety };
}

export async function pruneManagedDatabaseBackups(
  directoryPath: string,
  settings: NativeBackupSettings,
  options: BackupPruneOptions
) {
  const allEntries = await listManagedDatabaseBackups(directoryPath);
  const management = reconcileBackupManagement(directoryPath, allEntries.map((entry) => entry.fileName), options.now);
  const entries = allEntries.filter((entry) => management.whitelist.has(entry.fileName));
  const expired = allEntries.filter((entry) => management.expired.has(entry.fileName) &&
    !isManagedSafetySnapshotProtected(entry.filePath));
  const disposeFile = async (filePath: string) => {
    await options.disposeFile(filePath);
    forgetManagedBackup(filePath);
  };
  const { policyDeleted, capacityDeleted, selectedSafety } = selectPruningCandidates(entries, settings);
  const policyResult = await disposeEntries(policyDeleted, disposeFile);
  const capacityResult = await disposeEntries(capacityDeleted, disposeFile);
  const temporaryResult = await disposeEntries(expired, disposeFile);
  const removed = [...policyResult.removed, ...capacityResult.removed, ...temporaryResult.removed];
  const removedPaths = new Set(removed.map((entry) => entry.filePath));
  const remainingSizeBytes = entries
    .filter((entry) => !removedPaths.has(entry.filePath))
    .reduce((total, entry) => total + entry.sizeBytes, 0);
  const remainingBytesOverLimit = settings.total_size_limit_bytes > 0
    ? Math.max(0, remainingSizeBytes - settings.total_size_limit_bytes)
    : 0;
  return {
    capacityDeletedCount: capacityResult.removed.length,
    deletedCount: removed.length,
    failedCount: policyResult.failedCount + capacityResult.failedCount + temporaryResult.failedCount,
    ...(expired.length > 0 ? { temporaryDeletedCount: temporaryResult.removed.length,
      temporaryFailedCount: temporaryResult.failedCount } : {}),
    policyDeletedCount: policyResult.removed.length,
    releasedBytes: removed.reduce((total, entry) => total + entry.sizeBytes, 0),
    ...(remainingBytesOverLimit > 0 ? {
      remainingBytesOverLimit,
      safetySnapshotFloorPreserved: selectedSafety.every((entry) => !removedPaths.has(entry.filePath))
    } : {})
  } satisfies BackupPruneResult;
}

async function disposeEntries(
  entries: ApplicationDatabaseBackupEntry[],
  disposeFile: BackupPruneOptions['disposeFile']
) {
  const outcomes = await Promise.all(entries.map(async (entry) => {
    try {
      await disposeFile(entry.filePath);
      return entry;
    } catch {
      return null;
    }
  }));
  const removed = outcomes.filter((entry): entry is ApplicationDatabaseBackupEntry => entry !== null);
  return { failedCount: entries.length - removed.length, removed };
}

import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import {
  frequencyBucketKey,
  selectOrdinaryRestorePoints,
  type RestorePointsByTier
} from './backupRetentionPolicy.js';
import { isManagedSafetySnapshotProtected } from './managedSafetySnapshots.js';

export interface ApplicationDatabaseBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'manual' | 'automatic' | 'snapshot';
  autoFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  snapshotReason: 'pre-compact' | 'pre-migration' | 'pre-restore' | null;
  sizeBytes: number;
  updatedAt: string;
}

export interface BackupPruneResult {
  capacityDeletedCount: number;
  deletedCount: number;
  failedCount: number;
  policyDeletedCount: number;
  releasedBytes: number;
  remainingBytesOverLimit?: number;
  safetySnapshotFloorPreserved?: boolean;
}

export interface BackupPruneOptions {
  disposeFile: (filePath: string) => Promise<void>;
}

const LEGACY_AUTO_FILE_PATTERN =
  /^auto-(hourly|daily|weekly|monthly)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db(?:\.gz)?$/;
const MANAGED_RESTORE_POINT_PATTERN =
  /^foliole-(auto|manual|rollback)-(\d{6})-(\d{6})(?:-(\d+))?\.db(?:\.gz)?$/;
const AUTO_RESTORE_POINT_PATTERN = /^foliole-auto-backup-(\d{6})-(\d{6})\.db(?:\.gz)?$/;
const SNAPSHOT_FILE_PATTERN =
  /^(pre-compact|pre-migration|pre-restore)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db(?:\.gz)?$/;
const MANUAL_FILE_PATTERN =
  /^(?:manual|foliole)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db(?:\.gz)?$/;

function parseEntryFromFileName(fileName: string): Pick<
  ApplicationDatabaseBackupEntry,
  'autoFrequency' | 'kind' | 'snapshotReason'
> | null {
  const managedMatch = fileName.match(MANAGED_RESTORE_POINT_PATTERN);
  if (managedMatch?.[1] === 'auto') {
    return { autoFrequency: null, kind: 'automatic', snapshotReason: null };
  }
  if (managedMatch?.[1] === 'manual') {
    return { autoFrequency: null, kind: 'manual', snapshotReason: null };
  }
  if (managedMatch?.[1] === 'rollback') {
    return { autoFrequency: null, kind: 'snapshot', snapshotReason: null };
  }
  if (AUTO_RESTORE_POINT_PATTERN.test(fileName)) {
    return { autoFrequency: null, kind: 'automatic', snapshotReason: null };
  }
  const autoMatch = fileName.match(LEGACY_AUTO_FILE_PATTERN);
  if (autoMatch) {
    return {
      autoFrequency: autoMatch[1] as ApplicationDatabaseBackupEntry['autoFrequency'],
      kind: 'automatic',
      snapshotReason: null
    };
  }
  const snapshotMatch = fileName.match(SNAPSHOT_FILE_PATTERN);
  if (snapshotMatch) {
    return {
      autoFrequency: null,
      kind: 'snapshot',
      snapshotReason: snapshotMatch[1] as ApplicationDatabaseBackupEntry['snapshotReason']
    };
  }
  if (MANUAL_FILE_PATTERN.test(fileName)) {
    return { autoFrequency: null, kind: 'manual', snapshotReason: null };
  }
  return null;
}

async function readBackupDirectory(directoryPath: string) {
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(directoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const entries = await Promise.all(fileNames.map(async (fileName) => {
    if (!fileName.endsWith('.db') && !fileName.endsWith('.db.gz')) return null;
    const parsed = parseEntryFromFileName(fileName);
    if (!parsed) return null;
    const filePath = path.join(directoryPath, fileName);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return null;
    return {
      ...parsed,
      fileName,
      filePath,
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString()
    } satisfies ApplicationDatabaseBackupEntry;
  }));
  return entries
    .filter((entry): entry is ApplicationDatabaseBackupEntry => entry !== null)
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.fileName.localeCompare(right.fileName));
}

export async function listManagedDatabaseBackups(directoryPath: string) {
  return readBackupDirectory(directoryPath);
}

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

export async function pruneManagedDatabaseBackups(
  directoryPath: string,
  settings: NativeBackupSettings,
  options: BackupPruneOptions
) {
  const entries = await readBackupDirectory(directoryPath);
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
  const policyResult = await disposeEntries(policyDeleted, options.disposeFile);
  const capacityResult = await disposeEntries(capacityDeleted, options.disposeFile);
  const removed = [...policyResult.removed, ...capacityResult.removed];
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
    failedCount: policyResult.failedCount + capacityResult.failedCount,
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

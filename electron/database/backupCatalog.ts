import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { selectAutomaticRestorePoints } from './backupRetentionPolicy.js';
import { isManagedSafetySnapshotProtected } from './managedSafetySnapshots.js';

export interface ApplicationDatabaseBackupEntry {
  fileName: string;
  filePath: string;
  kind: 'manual' | 'automatic' | 'snapshot';
  autoFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  snapshotReason: 'pre-migration' | 'pre-restore' | null;
  sizeBytes: number;
  updatedAt: string;
}

export interface BackupPruneResult {
  capacityDeletedCount: number;
  deletedCount: number;
  policyDeletedCount: number;
  releasedBytes: number;
  remainingBytesOverLimit?: number;
  safetySnapshotFloorPreserved?: boolean;
}

const LEGACY_AUTO_FILE_PATTERN =
  /^auto-(hourly|daily|weekly|monthly)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db(?:\.gz)?$/;
const AUTO_RESTORE_POINT_PATTERN = /^foliole-auto-backup-(\d{6})-(\d{6})\.db(?:\.gz)?$/;
const SNAPSHOT_FILE_PATTERN =
  /^(pre-migration|pre-restore)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db(?:\.gz)?$/;
const MANUAL_FILE_PATTERN =
  /^(?:manual|foliole)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db(?:\.gz)?$/;

function parseEntryFromFileName(fileName: string): Pick<
  ApplicationDatabaseBackupEntry,
  'autoFrequency' | 'kind' | 'snapshotReason'
> | null {
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
    return {
      autoFrequency: null,
      kind: 'manual',
      snapshotReason: null
    };
  }
  return null;
}

async function readBackupDirectory(directoryPath: string) {
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(directoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [] as ApplicationDatabaseBackupEntry[];
    }
    throw error;
  }

  const entries = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.db') || fileName.endsWith('.db.gz'))
      .map(async (fileName) => {
        const parsed = parseEntryFromFileName(fileName);
        if (!parsed) {
          return null;
        }
        const filePath = path.join(directoryPath, fileName);
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          return null;
        }
        return {
          fileName,
          filePath,
          kind: parsed.kind,
          autoFrequency: parsed.autoFrequency,
          snapshotReason: parsed.snapshotReason,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString()
        } satisfies ApplicationDatabaseBackupEntry;
      })
  );

  return entries
    .filter((entry): entry is ApplicationDatabaseBackupEntry => entry !== null)
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.fileName.localeCompare(right.fileName)
    );
}

export async function listManagedDatabaseBackups(directoryPath: string) {
  return readBackupDirectory(directoryPath);
}

export async function pruneManagedDatabaseBackups(directoryPath: string, settings: NativeBackupSettings, now = new Date()) {
  const entries = await readBackupDirectory(directoryPath);
  const retained = new Set<string>();
  const protectedEntries = entries.filter((entry) => isManagedSafetySnapshotProtected(entry.filePath));
  protectedEntries.forEach((entry) => retained.add(entry.filePath));

  const manualEntries = entries.filter((entry) => entry.kind === 'manual').slice(0, settings.manual_max_count);
  manualEntries.forEach((entry) => retained.add(entry.filePath));

  const protectedSnapshotCount = protectedEntries.filter((entry) => entry.kind === 'snapshot').length;
  const snapshotEntries = entries
    .filter((entry) => entry.kind === 'snapshot' && !isManagedSafetySnapshotProtected(entry.filePath))
    .slice(0, Math.max(0, settings.snapshot_max_count - protectedSnapshotCount));
  snapshotEntries.forEach((entry) => retained.add(entry.filePath));

  const autoEntries = entries.filter((entry) => entry.kind === 'automatic');
  selectAutomaticRestorePoints(autoEntries, settings, now).forEach((filePath) => retained.add(filePath));

  const policyDeleted = entries.filter((entry) =>
    !retained.has(entry.filePath) && !isManagedSafetySnapshotProtected(entry.filePath));

  const retainedEntries = entries.filter((entry) => retained.has(entry.filePath));
  const latestCompletedSnapshot = retainedEntries.find((entry) =>
    entry.kind === 'snapshot' && !isManagedSafetySnapshotProtected(entry.filePath));
  let capacitySizeBytes = retainedEntries
    .filter((entry) => !isManagedSafetySnapshotProtected(entry.filePath))
    .reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (settings.total_size_limit_bytes > 0 && capacitySizeBytes > settings.total_size_limit_bytes) {
    const oldestFirst = [...retainedEntries].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    for (const entry of oldestFirst) {
      if (capacitySizeBytes <= settings.total_size_limit_bytes) {
        break;
      }
      if (isManagedSafetySnapshotProtected(entry.filePath) || entry.filePath === latestCompletedSnapshot?.filePath) {
        continue;
      }
      retained.delete(entry.filePath);
      capacitySizeBytes -= entry.sizeBytes;
    }
  }

  const capacityDeleted = retainedEntries.filter((entry) => !retained.has(entry.filePath));
  const policyRemoved = await removeBackupEntries(policyDeleted);
  const capacityRemoved = await removeBackupEntries(capacityDeleted);
  const deletedEntries = [...policyRemoved, ...capacityRemoved];
  const deletedPaths = new Set(deletedEntries.map((entry) => entry.filePath));
  const remainingSizeBytes = entries
    .filter((entry) => !deletedPaths.has(entry.filePath))
    .reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const remainingBytesOverLimit = settings.total_size_limit_bytes > 0
    ? Math.max(0, remainingSizeBytes - settings.total_size_limit_bytes)
    : 0;
  return {
    capacityDeletedCount: capacityRemoved.length,
    deletedCount: deletedEntries.length,
    policyDeletedCount: policyRemoved.length,
    releasedBytes: deletedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    ...(remainingBytesOverLimit > 0 ? {
      remainingBytesOverLimit,
      safetySnapshotFloorPreserved: latestCompletedSnapshot !== undefined && retained.has(latestCompletedSnapshot.filePath)
    } : {})
  } satisfies BackupPruneResult;
}

async function removeBackupEntries(entries: ApplicationDatabaseBackupEntry[]) {
  const removed = await Promise.all(entries.map(async (entry) => {
    try {
      await fs.rm(entry.filePath, { force: true });
      return entry;
    } catch {
      return null;
    }
  }));
  return removed.filter((entry): entry is ApplicationDatabaseBackupEntry => entry !== null);
}

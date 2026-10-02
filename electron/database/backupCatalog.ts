import { promises as fs } from 'node:fs';
import path from 'node:path';

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
  temporaryDeletedCount?: number;
  temporaryFailedCount?: number;
  deletedCount: number;
  failedCount: number;
  policyDeletedCount: number;
  releasedBytes: number;
  remainingBytesOverLimit?: number;
  safetySnapshotFloorPreserved?: boolean;
}

export interface BackupPruneOptions {
  disposeFile: (filePath: string) => Promise<void>;
  now?: number;
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

export { pruneManagedDatabaseBackups } from './backupPruning.js';

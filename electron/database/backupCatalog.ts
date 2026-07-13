import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeBackupSettings } from '../../lib/platform/nativeUtilityContract.js';

import { selectAutomaticRestorePoints } from './backupRetentionPolicy.js';

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
}

const LEGACY_AUTO_FILE_PATTERN =
  /^auto-(hourly|daily|weekly|monthly)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db$/;
const AUTO_RESTORE_POINT_PATTERN = /^foliole-auto-backup-(\d{6})-(\d{6})\.db$/;
const SNAPSHOT_FILE_PATTERN =
  /^(pre-migration|pre-restore)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db$/;
const MANUAL_FILE_PATTERN =
  /^(?:manual|foliole)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3})\.db$/;

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
      .filter((fileName) => fileName.endsWith('.db'))
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

  const manualEntries = entries.filter((entry) => entry.kind === 'manual').slice(0, settings.manual_max_count);
  manualEntries.forEach((entry) => retained.add(entry.filePath));

  const snapshotEntries = entries.filter((entry) => entry.kind === 'snapshot').slice(0, settings.snapshot_max_count);
  snapshotEntries.forEach((entry) => retained.add(entry.filePath));

  const autoEntries = entries.filter((entry) => entry.kind === 'automatic');
  selectAutomaticRestorePoints(autoEntries, settings, now).forEach((filePath) => retained.add(filePath));

  const policyDeleted = entries.filter((entry) => !retained.has(entry.filePath));

  const retainedEntries = entries.filter((entry) => retained.has(entry.filePath));
  let totalSizeBytes = retainedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (settings.total_size_limit_bytes > 0 && totalSizeBytes > settings.total_size_limit_bytes) {
    const oldestFirst = [...retainedEntries].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    for (const entry of oldestFirst) {
      if (totalSizeBytes <= settings.total_size_limit_bytes) {
        break;
      }
      retained.delete(entry.filePath);
      totalSizeBytes -= entry.sizeBytes;
    }
  }

  const capacityDeleted = retainedEntries.filter((entry) => !retained.has(entry.filePath));
  const deletedEntries = [...policyDeleted, ...capacityDeleted];
  await Promise.all(deletedEntries.map((entry) => fs.rm(entry.filePath, { force: true })));
  return {
    capacityDeletedCount: capacityDeleted.length,
    deletedCount: deletedEntries.length,
    policyDeletedCount: policyDeleted.length,
    releasedBytes: deletedEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
  } satisfies BackupPruneResult;
}

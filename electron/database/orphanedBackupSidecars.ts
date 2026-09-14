import { promises as fs } from 'node:fs';
import path from 'node:path';

import { isCompressedSqliteTemporaryPathActive } from './compressedSqliteBackup.js';

export interface OrphanedBackupSidecarCleanupResult {
  deletedCount: number;
  failedCount: number;
  releasedBytes: number;
}

interface CleanupOptions {
  isTemporaryActive?: (filePath: string) => boolean;
  removeFile?: (filePath: string) => Promise<void>;
}

const TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}`;
const BACKUP_STEM = String.raw`(?:auto-(?:hourly|daily|weekly|monthly)-${TIMESTAMP}|foliole-(?:auto|manual|rollback)-\d{6}-\d{6}(?:-\d+)?|foliole-auto-backup-\d{6}-\d{6}|(?:manual|foliole)-${TIMESTAMP}|pre-(?:migration|restore|compact)-${TIMESTAMP})\.db`;
const SIDECAR_PATTERN = new RegExp(String.raw`^(${BACKUP_STEM})-(?:shm|wal)$`);

export async function cleanupOrphanedBackupSidecars(
  backupDirectory: string,
  options: CleanupOptions = {}
): Promise<OrphanedBackupSidecarCleanupResult> {
  const removeFile = options.removeFile ?? ((filePath) => fs.rm(filePath));
  const isTemporaryActive = options.isTemporaryActive ?? isCompressedSqliteTemporaryPathActive;
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(backupDirectory);
  } catch {
    return emptyResult();
  }
  const names = new Set(fileNames);
  const outcomes = await Promise.all(fileNames.map(async (fileName) => {
    const match = fileName.match(SIDECAR_PATTERN);
    const databaseName = match?.[1];
    if (!databaseName || hasOwnerOrActiveTemporary(backupDirectory, names, databaseName, isTemporaryActive)) return null;
    const filePath = path.join(backupDirectory, fileName);
    try {
      const stats = await fs.lstat(filePath);
      if (!stats.isFile()) return null;
      await removeFile(filePath);
      return { deletedBytes: stats.size, failed: false };
    } catch {
      return { deletedBytes: 0, failed: true };
    }
  }));
  const handled = outcomes.filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== null);
  return {
    deletedCount: handled.filter((outcome) => !outcome.failed).length,
    failedCount: handled.filter((outcome) => outcome.failed).length,
    releasedBytes: handled.reduce((sum, outcome) => sum + outcome.deletedBytes, 0)
  };
}

function hasOwnerOrActiveTemporary(
  directory: string,
  names: Set<string>,
  databaseName: string,
  isTemporaryActive: (filePath: string) => boolean
) {
  if (names.has(databaseName) || names.has(`${databaseName}.gz`)) return true;
  const temporaryPrefix = `.${databaseName}.gz-`;
  return [...names].some((fileName) =>
    fileName.startsWith(temporaryPrefix) && isTemporaryActive(path.join(directory, fileName)));
}

function emptyResult(): OrphanedBackupSidecarCleanupResult {
  return { deletedCount: 0, failedCount: 0, releasedBytes: 0 };
}

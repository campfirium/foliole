import { promises as fs } from 'node:fs';
import path from 'node:path';

import { isCompressedSqliteTemporaryPathActive } from './compressedSqliteBackup.js';

export interface BackupTemporaryFileCleanupResult {
  deletedCount: number;
  releasedBytes: number;
}

interface BackupTemporaryFileCleanupOptions {
  removeFile?: (filePath: string) => Promise<void>;
}

const TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}`;
const UUID = String.raw`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
const MANAGED_DESTINATION = String.raw`(?:foliole-auto-backup-\d{6}-\d{6}|manual-${TIMESTAMP}|pre-(?:migration|restore)-${TIMESTAMP})\.db\.gz`;
const PRIVATE_TEMPORARY_FILE = new RegExp(
  String.raw`^\.${MANAGED_DESTINATION}-${UUID}\.(?:source\.db|compressed\.tmp)$`
);

export async function cleanupOrphanedBackupTemporaryFiles(
  backupDirectory: string,
  options: BackupTemporaryFileCleanupOptions = {}
): Promise<BackupTemporaryFileCleanupResult> {
  const removeFile = options.removeFile ?? ((filePath) => fs.rm(filePath));
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(backupDirectory);
  } catch {
    return { deletedCount: 0, releasedBytes: 0 };
  }

  const deletedSizes = await Promise.all(fileNames.map(async (fileName) => {
    if (!PRIVATE_TEMPORARY_FILE.test(fileName)) return null;
    const filePath = path.join(backupDirectory, fileName);
    if (isCompressedSqliteTemporaryPathActive(filePath)) return null;
    try {
      const stats = await fs.lstat(filePath);
      if (!stats.isFile()) return null;
      await removeFile(filePath);
      return stats.size;
    } catch {
      return null;
    }
  }));
  const removed = deletedSizes.filter((size): size is number => size !== null);
  return {
    deletedCount: removed.length,
    releasedBytes: removed.reduce((sum, size) => sum + size, 0)
  };
}

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeExtraBackupResult } from '../../lib/platform/nativeUtilityContract.js';

import { listManagedDatabaseBackups } from './backupCatalog.js';

export type ExtraBackupCopyResult = NativeExtraBackupResult;

export interface CopyExtraBackupOptions {
  extraBackupDir: string;
  maxCount: number;
  primaryBackupDir: string;
  sourcePath: string;
}

export function disabledExtraBackupResult(): ExtraBackupCopyResult {
  return { destinationPath: null, errorMessage: null, status: 'disabled' };
}

export async function copyExtraBackup(options: CopyExtraBackupOptions): Promise<ExtraBackupCopyResult> {
  if (!options.extraBackupDir) {
    return disabledExtraBackupResult();
  }

  if (await areSameDirectory(options.primaryBackupDir, options.extraBackupDir)) {
    return {
      destinationPath: null,
      errorMessage: 'Extra backup location matches the main backup location.',
      status: 'skipped_same_directory'
    };
  }

  let tempPath = '';
  try {
    await fs.mkdir(options.extraBackupDir, { recursive: true });
    const destinationPath = path.join(options.extraBackupDir, path.basename(options.sourcePath));
    tempPath = path.join(options.extraBackupDir, `.foliole-extra-backup-${randomUUID()}.tmp`);
    await fs.copyFile(options.sourcePath, tempPath);
    await fs.rm(destinationPath, { force: true });
    await fs.rename(tempPath, destinationPath);
    await pruneExtraBackups(options.extraBackupDir, options.maxCount);
    return { destinationPath, errorMessage: null, status: 'copied' };
  } catch (error) {
    return {
      destinationPath: null,
      errorMessage: error instanceof Error ? error.message : String(error),
      status: 'failed'
    };
  } finally {
    if (tempPath) {
      await fs.rm(tempPath, { force: true });
    }
  }
}

export async function pruneExtraBackups(directoryPath: string, maxCount: number) {
  const entries = await listManagedDatabaseBackups(directoryPath);
  const retained = new Set(entries.slice(0, Math.max(1, maxCount)).map((entry) => entry.filePath));
  const deletedPaths = entries.filter((entry) => !retained.has(entry.filePath)).map((entry) => entry.filePath);
  await Promise.all(deletedPaths.map((filePath) => fs.rm(filePath, { force: true })));
}

async function areSameDirectory(left: string, right: string) {
  const normalizedLeft = normalizeDirectoryForCompare(left);
  const normalizedRight = normalizeDirectoryForCompare(right);
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  const [leftRealPath, rightRealPath] = await Promise.all([safeRealPath(left), safeRealPath(right)]);
  return Boolean(leftRealPath && rightRealPath && normalizeDirectoryForCompare(leftRealPath) === normalizeDirectoryForCompare(rightRealPath));
}

function normalizeDirectoryForCompare(directoryPath: string) {
  return path.resolve(directoryPath).toLowerCase();
}

async function safeRealPath(directoryPath: string) {
  try {
    return await fs.realpath(directoryPath);
  } catch {
    return null;
  }
}

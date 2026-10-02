import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { NativeExtraBackupResult } from '../../lib/platform/nativeUtilityContract.js';

import { listManagedDatabaseBackups } from './backupCatalog.js';
import { forgetManagedBackup, reconcileBackupManagement, registerGeneratedBackup } from './backupManagement.js';

export type ExtraBackupCopyResult = NativeExtraBackupResult;

export interface CopyExtraBackupOptions {
  disposeFile: (filePath: string) => Promise<void>;
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
    await disposeExistingBackup(destinationPath, options.disposeFile);
    await fs.rename(tempPath, destinationPath);
    registerGeneratedBackup(destinationPath);
    await pruneExtraBackups(options.extraBackupDir, options.maxCount, options.disposeFile);
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

async function disposeExistingBackup(
  filePath: string,
  disposeFile: CopyExtraBackupOptions['disposeFile']
) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const entries = await listManagedDatabaseBackups(path.dirname(filePath));
  const management = reconcileBackupManagement(path.dirname(filePath), entries.map((entry) => entry.fileName));
  const name = path.basename(filePath);
  if (!management.whitelist.has(name) && !management.expired.has(name)) {
    throw new Error('An externally added backup with this name is still protected.');
  }
  await disposeFile(filePath);
  forgetManagedBackup(filePath);
}

async function pruneExtraBackups(
  directoryPath: string,
  maxCount: number,
  disposeFile: CopyExtraBackupOptions['disposeFile']
) {
  const entries = await listManagedDatabaseBackups(directoryPath);
  const management = reconcileBackupManagement(directoryPath, entries.map((entry) => entry.fileName));
  const generated = entries.filter((entry) => management.whitelist.has(entry.fileName));
  const retained = new Set(generated.slice(0, Math.max(1, maxCount)).map((entry) => entry.filePath));
  const deletedPaths = entries.filter((entry) =>
    (management.whitelist.has(entry.fileName) && !retained.has(entry.filePath)) ||
    management.expired.has(entry.fileName)).map((entry) => entry.filePath);
  await Promise.all(deletedPaths.map(async (filePath) => {
    await disposeFile(filePath);
    forgetManagedBackup(filePath);
  }));
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

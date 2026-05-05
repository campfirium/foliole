import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  NativeDirectoryImportConsumePolicy,
  NativeDirectoryImportEntry,
  NativeDirectoryImportSourceAdapter,
  NativeManagedInboxConsumePolicy
} from '../../lib/platform/nativeContract.js';

const IMPORT_ROOT_DIRNAME = 'import';
const MANAGED_ARCHIVE_DIRNAME = 'managed-inbox-archive';
const MANAGED_INBOX_DIRNAME = 'managed-inbox';

type ManagedInboxImportEntry = Pick<NativeDirectoryImportEntry, 'result_status' | 'source_locator'>;

export interface ManagedInboxPaths {
  archiveRootPath: string;
  rootPath: string;
}

export function resolveDirectoryImportSourceAdapter(
  sourceAdapter?: NativeDirectoryImportSourceAdapter
): NativeDirectoryImportSourceAdapter {
  return sourceAdapter === 'foliole_managed_inbox_folder' ? sourceAdapter : 'external_directory';
}

export function resolveDirectoryImportConsumePolicy(
  sourceAdapter?: NativeDirectoryImportSourceAdapter,
  requestedPolicy?: NativeManagedInboxConsumePolicy
): NativeDirectoryImportConsumePolicy {
  if (resolveDirectoryImportSourceAdapter(sourceAdapter) !== 'foliole_managed_inbox_folder') {
    return 'keep';
  }
  return requestedPolicy === 'archive' ? 'archive' : 'clear';
}

export function resolveManagedInboxPaths(appDataDir: string): ManagedInboxPaths {
  const importRootPath = path.join(appDataDir, IMPORT_ROOT_DIRNAME);
  return {
    archiveRootPath: path.join(importRootPath, MANAGED_ARCHIVE_DIRNAME),
    rootPath: path.join(importRootPath, MANAGED_INBOX_DIRNAME)
  };
}

export async function ensureManagedInboxRoot(rootPath: string) {
  await fs.mkdir(rootPath, { recursive: true });
}

function sanitizeArchiveBatchId(importedAt: string) {
  return importedAt.replaceAll(':', '-').replaceAll('.', '-');
}

function resolveManagedRelativePath(rootPath: string, sourceLocator: string) {
  const relativePath = path.relative(rootPath, sourceLocator);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`managed inbox source must stay within runtime-owned root: ${sourceLocator}`);
  }
  return relativePath;
}

async function pruneEmptyDirectories(rootPath: string, startDir: string) {
  let currentDir = startDir;
  while (currentDir.startsWith(rootPath) && currentDir !== rootPath) {
    const remainingEntries = await fs.readdir(currentDir);
    if (remainingEntries.length > 0) {
      return;
    }
    await fs.rmdir(currentDir);
    currentDir = path.dirname(currentDir);
  }
}

async function archiveManagedEntry(
  entry: ManagedInboxImportEntry,
  rootPath: string,
  archiveBatchPath: string
) {
  const relativePath = resolveManagedRelativePath(rootPath, entry.source_locator);
  const archiveTargetPath = path.join(archiveBatchPath, relativePath);
  await fs.mkdir(path.dirname(archiveTargetPath), { recursive: true });
  await fs.rename(entry.source_locator, archiveTargetPath);
  await pruneEmptyDirectories(rootPath, path.dirname(entry.source_locator));
}

async function clearManagedEntry(entry: ManagedInboxImportEntry, rootPath: string) {
  resolveManagedRelativePath(rootPath, entry.source_locator);
  await fs.rm(entry.source_locator, { force: true });
  await pruneEmptyDirectories(rootPath, path.dirname(entry.source_locator));
}

export async function applyManagedInboxConsumePolicy(
  entries: ManagedInboxImportEntry[],
  options: {
    archiveRootPath: string;
    importedAt: string;
    policy: Extract<NativeDirectoryImportConsumePolicy, 'archive' | 'clear'>;
    rootPath: string;
  }
) {
  const importedEntries = entries.filter((entry) => entry.result_status !== 'failed');
  if (importedEntries.length === 0) {
    return {
      archiveRootPath: null,
      consumedCount: 0
    };
  }

  const archiveBatchPath =
    options.policy === 'archive'
      ? path.join(options.archiveRootPath, sanitizeArchiveBatchId(options.importedAt))
      : null;
  if (archiveBatchPath) {
    await fs.mkdir(archiveBatchPath, { recursive: true });
  }

  for (const entry of importedEntries) {
    if (archiveBatchPath) {
      await archiveManagedEntry(entry, options.rootPath, archiveBatchPath);
      continue;
    }
    await clearManagedEntry(entry, options.rootPath);
  }

  return {
    archiveRootPath: archiveBatchPath,
    consumedCount: importedEntries.length
  };
}

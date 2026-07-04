import fs from 'node:fs/promises';
import path from 'node:path';

import { shell } from 'electron';

import {
  MANAGED_INBOX_DEFAULT_DIRNAME,
  normalizeManagedInboxPath
} from '../../lib/platform/managedInbox.js';
import type {
  NativeDirectoryImportConsumePolicy,
  NativeDirectoryImportEntry,
  NativeDirectoryImportSourceAdapter,
  NativeManagedInboxConsumePolicy
} from '../../lib/platform/nativeContract.js';

const MANAGED_ARCHIVE_DIRNAME = 'inbox-archive';

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

export function resolveManagedInboxPaths(appDataDir: string, configuredRootPath?: string | null): ManagedInboxPaths {
  const normalizedConfiguredRootPath = normalizeManagedInboxPath(configuredRootPath);
  return {
    archiveRootPath: path.join(appDataDir, MANAGED_ARCHIVE_DIRNAME),
    rootPath: normalizedConfiguredRootPath ?? path.join(appDataDir, MANAGED_INBOX_DEFAULT_DIRNAME)
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
  archiveBatchPath: string,
  shouldPruneEmptyDirectories: boolean
) {
  const relativePath = resolveManagedRelativePath(rootPath, entry.source_locator);
  const archiveTargetPath = path.join(archiveBatchPath, relativePath);
  await fs.mkdir(path.dirname(archiveTargetPath), { recursive: true });
  await fs.rename(entry.source_locator, archiveTargetPath);
  if (shouldPruneEmptyDirectories) {
    await pruneEmptyDirectories(rootPath, path.dirname(entry.source_locator));
  }
}

async function clearManagedEntry(
  entry: ManagedInboxImportEntry,
  rootPath: string,
  shouldPruneEmptyDirectories: boolean
) {
  resolveManagedRelativePath(rootPath, entry.source_locator);
  await shell.trashItem(entry.source_locator);
  if (shouldPruneEmptyDirectories) {
    await pruneEmptyDirectories(rootPath, path.dirname(entry.source_locator));
  }
}

export async function applyManagedInboxConsumePolicy(
  entries: ManagedInboxImportEntry[],
  options: {
    archiveRootPath: string;
    importedAt: string;
    policy: Extract<NativeDirectoryImportConsumePolicy, 'archive' | 'clear'>;
    pruneEmptyDirectories?: boolean;
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
  const shouldPruneEmptyDirectories = options.pruneEmptyDirectories !== false;

  for (const entry of importedEntries) {
    if (archiveBatchPath) {
      await archiveManagedEntry(entry, options.rootPath, archiveBatchPath, shouldPruneEmptyDirectories);
      continue;
    }
    await clearManagedEntry(entry, options.rootPath, shouldPruneEmptyDirectories);
  }

  return {
    archiveRootPath: archiveBatchPath,
    consumedCount: importedEntries.length
  };
}

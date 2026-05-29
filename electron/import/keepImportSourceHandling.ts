import fs from 'node:fs/promises';
import path from 'node:path';

import { shell } from 'electron';

import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { resolveGenericSplitHighlightPath } from './genericSplitPreparedImport.js';
import type { KeepImportRuleConfig } from './keepImportService.js';

function resolveSourceHandlingPaths(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const paths = [source.filePath];
  if (config.highlightMode === 'split' && config.highlightDirectoryPath?.trim()) {
    paths.push(resolveGenericSplitHighlightPath(source, config.highlightDirectoryPath.trim()));
  }
  return [...new Set(paths.map((filePath) => path.resolve(filePath)))];
}

async function deleteFileIfPresent(filePath: string) {
  try {
    await fs.access(filePath);
    await shell.trashItem(filePath);
    return null;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    return error instanceof Error ? error.message : String(error);
  }
}

export async function applySuccessfulSourceHandling(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  if (config.actionMode !== 'delete') {
    return null;
  }
  const failures: string[] = [];
  for (const filePath of resolveSourceHandlingPaths(config, source)) {
    const failure = await deleteFileIfPresent(filePath);
    if (failure) {
      failures.push(`${filePath}: ${failure}`);
    }
  }
  return failures.length > 0 ? `Imported, but source cleanup failed: ${failures.join('; ')}` : null;
}

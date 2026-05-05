import { dialog, type BrowserWindow } from 'electron';

import type { NativeDirectoryImportArgs, NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import { runDirectoryImportBatch } from '../import/directoryImportBatch.js';

import {
  discoverDirectoryImportSources,
  resolveImportHighlightPolicy
} from './importSourcePipeline.js';
import {
  ensureManagedInboxRoot,
  resolveDirectoryImportConsumePolicy,
  resolveDirectoryImportSourceAdapter,
  resolveManagedInboxPaths
} from './managedInboxFolder.js';
import { resolveAppPaths } from './paths.js';

async function selectImportDirectoryPath(window?: BrowserWindow | null, args?: NativeDirectoryImportArgs) {
  const sourceAdapter = resolveDirectoryImportSourceAdapter(args?.source_adapter);
  if (sourceAdapter === 'foliole_managed_inbox_folder') {
    if (typeof args?.directory_path === 'string' && args.directory_path.trim().length > 0) {
      throw new Error('managed inbox folder path is runtime-owned');
    }
    const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir);
    await ensureManagedInboxRoot(managedPaths.rootPath);
    return managedPaths.rootPath;
  }

  if (typeof args?.directory_path === 'string' && args.directory_path.trim().length > 0) {
    return args.directory_path;
  }

  const selection = window
    ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }
  return selection.filePaths[0] ?? null;
}

export async function runDirectoryImport(
  window?: BrowserWindow | null,
  args?: NativeDirectoryImportArgs
): Promise<NativeDirectoryImportResult | null> {
  const sourceAdapter = resolveDirectoryImportSourceAdapter(args?.source_adapter);
  const consumePolicy = resolveDirectoryImportConsumePolicy(sourceAdapter, args?.consume_policy);
  const rootPath = await selectImportDirectoryPath(window, args);
  if (!rootPath) {
    return null;
  }

  const highlightPolicy = resolveImportHighlightPolicy(args);
  const sources = await discoverDirectoryImportSources(rootPath);
  return runDirectoryImportBatch({
    consumePolicy,
    highlightPolicy,
    rootPath,
    sourceAdapter,
    sources
  });
}

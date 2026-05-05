import { dialog, type BrowserWindow } from 'electron';

import type { NativeDirectoryImportArgs, NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import { runDirectoryImportBatch } from '../import/directoryImportBatch.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';
import { logDirectoryImportCompleted, logDirectoryImportFailed } from '../import/importRunLogger.js';
import { notifyManagedInboxUpdated } from '../import/managedInboxEvents.js';

import {
  discoverDirectoryImportSources,
  resolveImportHighlightPolicy,
  resolveImportNodeTitleStrategy
} from './importSourcePipeline.js';
import { loadLibraryPathSettings } from './libraryPaths.js';
import {
  ensureManagedInboxRoot,
  resolveDirectoryImportConsumePolicy,
  resolveDirectoryImportSourceAdapter,
  resolveManagedInboxPaths
} from './managedInboxFolder.js';
import { resolveAppPaths } from './paths.js';

function resolveLatestImportId(result: NativeDirectoryImportResult) {
  const latestEntry = result.entries[result.entries.length - 1];
  return typeof latestEntry?.import_id === 'string' ? latestEntry.import_id : null;
}

async function resolveManagedInboxRootPath() {
  const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir, (await loadLibraryPathSettings()).inbox);
  await ensureManagedInboxRoot(managedPaths.rootPath);
  return managedPaths.rootPath;
}

async function selectImportDirectoryPath(window?: BrowserWindow | null, args?: NativeDirectoryImportArgs) {
  const sourceAdapter = resolveDirectoryImportSourceAdapter(args?.source_adapter);
  if (sourceAdapter === 'foliole_managed_inbox_folder') {
    if (typeof args?.directory_path === 'string' && args.directory_path.trim().length > 0) {
      throw new Error('managed inbox folder path is runtime-owned');
    }
    return resolveManagedInboxRootPath();
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
  try {
    const consumePolicy = resolveDirectoryImportConsumePolicy(sourceAdapter, args?.consume_policy);
    const rootPath = await selectImportDirectoryPath(window, args);
    if (!rootPath) {
      return null;
    }

    const highlightPolicy = resolveImportHighlightPolicy(args);
    const titleStrategy = args?.title_strategy ? resolveImportNodeTitleStrategy(args) : loadImportManagerSettings().titleStrategy;
    const sources = await discoverDirectoryImportSources(
      rootPath,
      sourceAdapter === 'foliole_managed_inbox_folder' ? { supportedKinds: ['markdown', 'text'] } : undefined
    );
    const result = await runDirectoryImportBatch({
      consumePolicy,
      highlightPolicy,
      rootPath,
      sourceAdapter,
      sources,
      titleStrategy
    });
    const latestImportId = resolveLatestImportId(result);
    if (latestImportId) {
      notifyManagedInboxUpdated(latestImportId);
    }
    await logDirectoryImportCompleted(result);
    return result;
  } catch (error) {
    await logDirectoryImportFailed(sourceAdapter, error);
    throw error;
  }
}

export async function runManagedInboxImport(rootPath: string) {
  try {
    const titleStrategy = loadImportManagerSettings().titleStrategy;
    const result = await runDirectoryImportBatch({
      consumePolicy: 'clear',
      highlightPolicy: 'reference_only',
      rootPath,
      sourceAdapter: 'foliole_managed_inbox_folder',
      sources: await discoverDirectoryImportSources(rootPath, { supportedKinds: ['markdown', 'text'] }),
      titleStrategy
    });
    await logDirectoryImportCompleted(result);
    return result;
  } catch (error) {
    await logDirectoryImportFailed('foliole_managed_inbox_folder', error);
    throw error;
  }
}

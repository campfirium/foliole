import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type {
  NativeDirectoryImportResult,
  NativeDirectoryImportSourceAdapter,
  NativeManagedInboxConsumePolicy
} from '../../lib/platform/nativeContract.js';
import { discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';
import {
  ensureManagedInboxRoot,
  resolveDirectoryImportConsumePolicy,
  resolveDirectoryImportSourceAdapter,
  resolveManagedInboxPaths
} from '../ipc/managedInboxFolder.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { runDirectoryImportBatch } from './directoryImportBatch.js';
import {
  loadWatchImportAdapterCursor,
  saveWatchImportAdapterCursor,
  type WatchImportAdapterCursor,
  type WatchImportCursorEntry
} from './watchImportState.js';

export interface WatchImportAdapterConfig {
  adapterConfigId: string;
  consumePolicy?: NativeManagedInboxConsumePolicy;
  directoryPath?: string | null;
  highlightPolicy?: ImportHighlightPolicy;
  sourceAdapter?: NativeDirectoryImportSourceAdapter;
}

export interface WatchImportAdapterResult extends NativeDirectoryImportResult {
  adapter_config_id: string;
  pending_count: number;
  skipped_count: number;
}

export interface WatchImportRunResult {
  adapters: WatchImportAdapterResult[];
}

function toCursorEntry(source: DirectoryImportSourceDescriptor): WatchImportCursorEntry {
  return {
    mtimeMs: source.mtimeMs,
    sizeBytes: source.sizeBytes
  };
}

function isSourceChanged(source: DirectoryImportSourceDescriptor, previousEntry?: WatchImportCursorEntry) {
  if (!previousEntry) {
    return true;
  }
  return previousEntry.mtimeMs !== source.mtimeMs || previousEntry.sizeBytes !== source.sizeBytes;
}

async function resolveWatchImportRootPath(config: WatchImportAdapterConfig, sourceAdapter: NativeDirectoryImportSourceAdapter) {
  if (sourceAdapter === 'foliole_managed_inbox_folder') {
    const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir);
    await ensureManagedInboxRoot(managedPaths.rootPath);
    return managedPaths.rootPath;
  }
  if (typeof config.directoryPath === 'string' && config.directoryPath.trim().length > 0) {
    return config.directoryPath;
  }
  throw new Error(`watch import adapter requires directory_path: ${config.adapterConfigId}`);
}

function buildUpdatedCursorEntries(
  discoveredSources: DirectoryImportSourceDescriptor[],
  previousCursor: WatchImportAdapterCursor | null,
  resultEntries: NativeDirectoryImportResult['entries']
) {
  const previousEntries = previousCursor?.entries ?? {};
  const resultBySourceName = new Map(resultEntries.map((entry) => [entry.source_name, entry]));
  return discoveredSources.reduce<Record<string, WatchImportCursorEntry>>((accumulator, source) => {
    const resultEntry = resultBySourceName.get(source.sourceName);
    if (!resultEntry) {
      accumulator[source.sourceName] = toCursorEntry(source);
      return accumulator;
    }
    if (resultEntry.result_status !== 'failed') {
      accumulator[source.sourceName] = toCursorEntry(source);
      return accumulator;
    }
    const previousEntry = previousEntries[source.sourceName];
    if (previousEntry) {
      accumulator[source.sourceName] = previousEntry;
    }
    return accumulator;
  }, {});
}

async function runSingleWatchImport(config: WatchImportAdapterConfig): Promise<WatchImportAdapterResult> {
  const sourceAdapter = resolveDirectoryImportSourceAdapter(config.sourceAdapter);
  const consumePolicy = resolveDirectoryImportConsumePolicy(sourceAdapter, config.consumePolicy);
  const rootPath = await resolveWatchImportRootPath(config, sourceAdapter);
  const loadedCursor = loadWatchImportAdapterCursor(config.adapterConfigId);
  const previousCursor = loadedCursor?.rootPath === rootPath ? loadedCursor : null;
  const discoveredSources = await discoverDirectoryImportSources(rootPath);
  const pendingSources = discoveredSources.filter((source) => isSourceChanged(source, previousCursor?.entries[source.sourceName]));
  const batchResult =
    pendingSources.length > 0
      ? await runDirectoryImportBatch({
          consumePolicy,
          highlightPolicy: config.highlightPolicy ?? 'reference_only',
          rootPath,
          sourceAdapter,
          sources: pendingSources
        })
      : {
          archive_root_path: null,
          consume_policy: consumePolicy,
          consumed_count: 0,
          discovered_count: 0,
          entries: [],
          failed_count: 0,
          imported_count: 0,
          root_path: rootPath,
          source_adapter: sourceAdapter
        };

  saveWatchImportAdapterCursor(config.adapterConfigId, {
    entries: buildUpdatedCursorEntries(discoveredSources, previousCursor, batchResult.entries),
    rootPath,
    updatedAt: new Date().toISOString()
  });

  return {
    ...batchResult,
    adapter_config_id: config.adapterConfigId,
    discovered_count: discoveredSources.length,
    pending_count: pendingSources.length,
    skipped_count: discoveredSources.length - pendingSources.length
  };
}

export async function runWatchImportCycle(configs: WatchImportAdapterConfig[]): Promise<WatchImportRunResult> {
  const adapters: WatchImportAdapterResult[] = [];
  for (const config of configs) {
    adapters.push(await runSingleWatchImport(config));
  }
  return { adapters };
}

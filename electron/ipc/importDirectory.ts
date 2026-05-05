import { dialog, type BrowserWindow } from 'electron';

import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import type { NativeDirectoryImportArgs, NativeDirectoryImportEntry, NativeDirectoryImportResult } from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';

import {
  buildPreparedImportRecord,
  discoverDirectoryImportSources,
  loadPreparedImportRecord,
  resolveImportHighlightPolicy
} from './importSourcePipeline.js';
import {
  applyManagedInboxConsumePolicy,
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

function toNativeDirectoryImportEntry(
  adapter: NativeDirectoryImportEntry['adapter'],
  record: PersistedImportRecord
): NativeDirectoryImportEntry {
  return {
    adapter,
    content_fingerprint: record.contentFingerprint,
    degraded_reason: record.degradedReason,
    duplicate_semantic: record.duplicateSemantic,
    failure_reason: record.failureReason,
    import_id: record.importId,
    imported_at: record.importedAt,
    node_id: record.nodeId,
    provider: record.provider,
    result_status: record.resultStatus,
    source_fingerprint: record.sourceFingerprint,
    source_kind: record.sourceKind,
    source_locator: record.sourceLocator,
    source_name: record.sourceName
  };
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
  const entries: NativeDirectoryImportEntry[] = [];

  for (const source of sources) {
    const importedAt = new Date().toISOString();
    try {
      entries.push(
        toNativeDirectoryImportEntry(source.adapterId, runPreparedImport(await loadPreparedImportRecord(source, { highlightPolicy, importedAt })))
      );
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
      entries.push(
        toNativeDirectoryImportEntry(
          source.adapterId,
          recordPreparedImportFailure(
            buildPreparedImportRecord(source, { content: '', highlightPolicy, importedAt }),
            failureReason
          )
        )
      );
    }
  }

  let archiveRootPath: string | null = null;
  let consumedCount = 0;
  if (sourceAdapter === 'foliole_managed_inbox_folder' && consumePolicy !== 'keep') {
    const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir);
    const consumed = await applyManagedInboxConsumePolicy(entries, {
      archiveRootPath: managedPaths.archiveRootPath,
      importedAt: new Date().toISOString(),
      policy: consumePolicy,
      rootPath: managedPaths.rootPath
    });
    archiveRootPath = consumed.archiveRootPath;
    consumedCount = consumed.consumedCount;
  }

  return {
    archive_root_path: archiveRootPath,
    consume_policy: consumePolicy,
    consumed_count: consumedCount,
    discovered_count: sources.length,
    failed_count: entries.filter((entry) => entry.result_status === 'failed').length,
    imported_count: entries.filter((entry) => entry.result_status !== 'failed').length,
    root_path: rootPath,
    source_adapter: sourceAdapter,
    entries
  };
}

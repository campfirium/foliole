import type { PersistedImportRecord, ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { ImportNodeTitleStrategy } from '../../lib/core/import/importedNodeTitle.js';
import type {
  NativeDirectoryImportConsumePolicy,
  NativeDirectoryImportEntry,
  NativeDirectoryImportResult,
  NativeDirectoryImportSourceAdapter
} from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import {
  buildPreparedImportRecord,
  loadPreparedImportRecord,
  type DirectoryImportSourceDescriptor
} from '../ipc/importSourcePipeline.js';
import { applyManagedInboxConsumePolicy, resolveManagedInboxPaths } from '../ipc/managedInboxFolder.js';
import { resolveAppPaths } from '../ipc/paths.js';

export interface DirectoryImportBatchOptions {
  consumePolicy: NativeDirectoryImportConsumePolicy;
  highlightPolicy: ImportHighlightPolicy;
  rootPath: string;
  sourceAdapter: NativeDirectoryImportSourceAdapter;
  sources: DirectoryImportSourceDescriptor[];
  titleStrategy: ImportNodeTitleStrategy;
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

async function runSingleDirectoryImport(
  source: DirectoryImportSourceDescriptor,
  highlightPolicy: ImportHighlightPolicy,
  titleStrategy: ImportNodeTitleStrategy
) {
  const importedAt = new Date().toISOString();
  try {
    return toNativeDirectoryImportEntry(
      source.adapterId,
      runPreparedImport(
        await loadPreparedImportRecord(source, {
          highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          titleStrategy
        })
      )
    );
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown import failure';
    return toNativeDirectoryImportEntry(
      source.adapterId,
      recordPreparedImportFailure(
        buildPreparedImportRecord(source, {
          content: '',
          highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          titleStrategy
        }),
        failureReason
      )
    );
  }
}

export async function runDirectoryImportBatch(options: DirectoryImportBatchOptions): Promise<NativeDirectoryImportResult> {
  const entries = await Promise.all(
    options.sources.map((source) => runSingleDirectoryImport(source, options.highlightPolicy, options.titleStrategy))
  );

  let archiveRootPath: string | null = null;
  let consumedCount = 0;
  if (options.sourceAdapter === 'foliole_managed_inbox_folder' && options.consumePolicy !== 'keep') {
    const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir, options.rootPath);
    const consumed = await applyManagedInboxConsumePolicy(entries, {
      archiveRootPath: managedPaths.archiveRootPath,
      importedAt: new Date().toISOString(),
      policy: options.consumePolicy,
      rootPath: options.rootPath
    });
    archiveRootPath = consumed.archiveRootPath;
    consumedCount = consumed.consumedCount;
  }

  return {
    archive_root_path: archiveRootPath,
    consume_policy: options.consumePolicy,
    consumed_count: consumedCount,
    discovered_count: options.sources.length,
    failed_count: entries.filter((entry) => entry.result_status === 'failed').length,
    imported_count: entries.filter((entry) => entry.result_status !== 'failed').length,
    root_path: options.rootPath,
    source_adapter: options.sourceAdapter,
    entries
  };
}

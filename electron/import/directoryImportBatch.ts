import type { PersistedImportRecord, ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import type { ImportNodeTitleStrategy } from '../../lib/core/import/importedNodeTitle.js';
import type {
  NativeDirectoryImportConsumePolicy,
  NativeDirectoryImportEntry,
  NativeDirectoryImportResult,
  NativeDirectoryImportSourceAdapter
} from '../../lib/platform/nativeContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import { runEpubImport } from '../ipc/epubImport.js';
import {
  buildPreparedImportRecord,
  loadPreparedImportRecord,
  type DirectoryImportSourceDescriptor
} from '../ipc/importSourcePipeline.js';
import { applyManagedInboxConsumePolicy, resolveManagedInboxPaths } from '../ipc/managedInboxFolder.js';
import { resolveAppPaths } from '../ipc/paths.js';

import {
  createLocalImageInboxMarkdown,
  createUnsupportedLocalImageMessage,
  validateLocalImageInboxFile
} from './localImageInboxSource.js';

export interface DirectoryImportBatchOptions {
  consumePolicy: NativeDirectoryImportConsumePolicy;
  highlightPolicy: ImportHighlightPolicy;
  resolveTargetParentNodeId?: (source: DirectoryImportSourceDescriptor, importedAt: string) => string | undefined;
  importRootPath?: string;
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
  resolveTargetParentNodeId: DirectoryImportBatchOptions['resolveTargetParentNodeId'],
  titleStrategy: ImportNodeTitleStrategy
) {
  const importedAt = new Date().toISOString();
  const targetParentNodeId = resolveTargetParentNodeId?.(source, importedAt);
  try {
    if (source.kind === 'epub') {
      return toNativeDirectoryImportEntry(source.adapterId, await runEpubImport(source, importedAt));
    }
    if (source.importMode === 'unsupported_local_image') {
      throw new Error(createUnsupportedLocalImageMessage());
    }
    if (source.importMode === 'local_image') {
      const imageValidationFailure = await validateLocalImageInboxFile(source.filePath);
      if (imageValidationFailure) {
        throw new Error(imageValidationFailure);
      }
    }
    const preparedRecord =
      source.importMode === 'local_image'
        ? buildPreparedImportRecord(source, {
            content: createLocalImageInboxMarkdown(source.filePath),
            highlightPolicy,
            importedAt,
            sourceTrackingMode: 'untracked',
            ...(targetParentNodeId ? { targetParentNodeId } : {}),
            titleStrategy
          })
        : await loadPreparedImportRecord(source, {
            highlightPolicy,
            importedAt,
            sourceTrackingMode: 'untracked',
            ...(targetParentNodeId ? { targetParentNodeId } : {}),
            titleStrategy
          });
    return toNativeDirectoryImportEntry(
      source.adapterId,
      runPreparedImport(preparedRecord)
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
          ...(targetParentNodeId ? { targetParentNodeId } : {}),
          titleStrategy
        }),
        failureReason
      )
    );
  }
}

export async function runDirectoryImportBatch(options: DirectoryImportBatchOptions): Promise<NativeDirectoryImportResult> {
  const entries = await Promise.all(
    options.sources.map((source) => runSingleDirectoryImport(
      source,
      options.highlightPolicy,
      options.resolveTargetParentNodeId,
      options.titleStrategy
    ))
  );

  let archiveRootPath: string | null = null;
  let consumedCount = 0;
  if (options.sourceAdapter === 'foliole_managed_inbox_folder' && options.consumePolicy !== 'keep') {
    const managedPaths = resolveManagedInboxPaths(resolveAppPaths().app_data_dir, options.rootPath);
    const consumed = await applyManagedInboxConsumePolicy(entries, {
      archiveRootPath: managedPaths.archiveRootPath,
      importedAt: new Date().toISOString(),
      policy: options.consumePolicy,
      pruneEmptyDirectories: options.rootPath !== options.importRootPath,
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

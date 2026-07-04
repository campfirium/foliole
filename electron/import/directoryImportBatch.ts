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
  resolveImportRelativePath,
  resolveIncomingUpdateTarget,
  upsertPendingIncomingUpdate
} from './incomingUpdates.js';
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

async function tryCreateIncomingUpdateEntry(
  source: DirectoryImportSourceDescriptor,
  options: DirectoryImportBatchOptions,
  importedAt: string
): Promise<NativeDirectoryImportEntry | null> {
  if (options.sourceAdapter !== 'foliole_managed_inbox_folder' || !options.importRootPath) {
    return null;
  }
  const relativePath = resolveImportRelativePath(options.importRootPath, source.filePath);
  const target = relativePath
    ? resolveIncomingUpdateTarget({ relativePath, sourceLocator: source.filePath })
    : null;
  if (!target) {
    return null;
  }
  const prepared = await loadPreparedImportRecord(source, {
    highlightPolicy: options.highlightPolicy,
    importedAt,
    sourceTrackingMode: 'untracked',
    titleStrategy: options.titleStrategy
  });
  const importId = upsertPendingIncomingUpdate({
    importedAt,
    sourcePath: target.sourcePath,
    topicId: target.topicId,
    updatedContent: prepared.content
  });
  return {
    adapter: source.adapterId,
    content_fingerprint: prepared.contentFingerprint,
    degraded_reason: prepared.degradedReason,
    duplicate_semantic: 'updated',
    failure_reason: null,
    import_id: importId,
    imported_at: importedAt,
    node_id: target.topicId,
    provider: prepared.provider,
    result_status: 'imported',
    source_fingerprint: prepared.sourceFingerprint,
    source_kind: prepared.sourceKind,
    source_locator: prepared.sourceLocator,
    source_name: prepared.sourceName
  };
}

async function prepareDirectoryImportRecord(
  source: DirectoryImportSourceDescriptor,
  options: DirectoryImportBatchOptions,
  importedAt: string,
  targetParentNodeId: string | null | undefined
) {
  const commonOptions = {
    highlightPolicy: options.highlightPolicy,
    importedAt,
    sourceTrackingMode: 'untracked' as const,
    ...(targetParentNodeId ? { targetParentNodeId } : {}),
    titleStrategy: options.titleStrategy
  };
  return source.importMode === 'local_image'
    ? buildPreparedImportRecord(source, {
        ...commonOptions,
        content: createLocalImageInboxMarkdown(source.filePath)
      })
    : loadPreparedImportRecord(source, commonOptions);
}

async function runSingleDirectoryImport(
  source: DirectoryImportSourceDescriptor,
  options: DirectoryImportBatchOptions
) {
  const importedAt = new Date().toISOString();
  const incomingUpdateEntry = await tryCreateIncomingUpdateEntry(source, options, importedAt);
  if (incomingUpdateEntry) {
    return incomingUpdateEntry;
  }
  const targetParentNodeId = options.resolveTargetParentNodeId?.(source, importedAt);
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
    const preparedRecord = await prepareDirectoryImportRecord(source, options, importedAt, targetParentNodeId);
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
          highlightPolicy: options.highlightPolicy,
          importedAt,
          sourceTrackingMode: 'untracked',
          ...(targetParentNodeId ? { targetParentNodeId } : {}),
          titleStrategy: options.titleStrategy
        }),
        failureReason
      )
    );
  }
}

export async function runDirectoryImportBatch(options: DirectoryImportBatchOptions): Promise<NativeDirectoryImportResult> {
  const entries = await Promise.all(
    options.sources.map((source) => runSingleDirectoryImport(source, options))
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

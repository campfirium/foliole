import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { rewriteExternalPreviewContent } from '../database/externalSearchPreviewContent.js';
import { readKeepImportItemCache, upsertKeepImportItemCache } from '../database/keepImportItemCache.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadPreparedKeepImportRecord } from './keepImportPreparedRecord.js';
import type { KeepImportRuleConfig } from './keepImportService.js';

function createPreviewFolder(directoryPath: string): NativeExternalSearchFolder {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    created_at: '',
    document_count: 0,
    excluded_dirs: [],
    folder_path: directoryPath,
    id: 'keep-import-cache-preview',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: ''
  };
}

function resolveCachedTitle(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor, prepared: Awaited<ReturnType<typeof loadPreparedKeepImportRecord>>) {
  if (config.sourceType === 'readwise') {
    return prepared.nodeTitle;
  }
  return resolveImportedNodeTitle({
    content: prepared.content,
    sourceName: source.sourceName,
    titleStrategy: 'heading'
  });
}

function canReuseExistingCache(existing: NonNullable<ReturnType<typeof readKeepImportItemCache>>, source: DirectoryImportSourceDescriptor) {
  return existing.source_mtime_ms === source.mtimeMs && existing.source_size_bytes === source.sizeBytes;
}

export async function refreshKeepImportItemCache(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  refreshedAt: string,
  options: { force?: boolean } = {}
) {
  const existing = readKeepImportItemCache(config.ruleId, source.sourceName);
  if (!options.force && existing && canReuseExistingCache(existing, source)) {
    return;
  }
  const prepared = await loadPreparedKeepImportRecord(config, source, refreshedAt);
  const previewContent = rewriteExternalPreviewContent(
    prepared.content,
    source.filePath,
    createPreviewFolder(config.directoryPath)
  );
  upsertKeepImportItemCache({
    content: previewContent,
    contentPreview: previewContent,
    refreshedAt,
    ruleId: config.ruleId,
    sourceMtimeMs: source.mtimeMs,
    sourcePath: source.sourceName,
    sourceSizeBytes: source.sizeBytes,
    title: resolveCachedTitle(config, source, prepared)
  });
}

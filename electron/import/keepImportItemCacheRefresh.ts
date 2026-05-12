import fs from 'node:fs/promises';

import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { rewriteExternalPreviewContent } from '../database/externalSearchPreviewContent.js';
import { readKeepImportItemCache, upsertKeepImportItemCache } from '../database/keepImportItemCache.js';
import { toImportPayload, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

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

export async function refreshKeepImportItemCache(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor, refreshedAt: string) {
  const existing = readKeepImportItemCache(config.ruleId, source.sourceName);
  if (
    existing?.source_mtime_ms === source.mtimeMs &&
    existing.source_size_bytes === source.sizeBytes
  ) {
    return;
  }
  const rawContent = await fs.readFile(source.filePath, 'utf8');
  const content = toImportPayload(rawContent, source.kind, source.sourceName).content;
  const title = resolveImportedNodeTitle({
    content,
    sourceName: source.sourceName,
    titleStrategy: 'heading'
  });
  const previewContent = rewriteExternalPreviewContent(
    content,
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
    title
  });
}

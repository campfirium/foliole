import path from 'node:path';

import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';
import { upsertExternalDocuments } from '../database/externalDocuments.js';
import type { ScannedDocument } from '../database/externalSearchCacheSupport.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

const READWISE_EXTERNAL_FOLDER_PREFIX = 'readwise-reader-import';

export function buildReadwiseExternalFolder(
  kind: ReadwiseSourceKind,
  primaryPath: string,
  indexedAt: string
): NativeExternalSearchFolder {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    created_at: indexedAt,
    document_count: 0,
    excluded_dirs: [],
    folder_path: primaryPath,
    id: `${READWISE_EXTERNAL_FOLDER_PREFIX}-${kind}`,
    indexed_at: indexedAt,
    last_error: null,
    status: 'ready',
    updated_at: indexedAt
  };
}

export function buildReadwiseExternalDocumentId(kind: ReadwiseSourceKind, sourceName: string) {
  return `${READWISE_EXTERNAL_FOLDER_PREFIX}-${kind}:${sourceName.replace(/\\/g, '/')}`;
}

export function upsertReadwiseExternalDocument(input: {
  content: string;
  indexedAt: string;
  kind: ReadwiseSourceKind;
  primaryPath: string;
  source: DirectoryImportSourceDescriptor;
}) {
  const relativePath = input.source.sourceName.replace(/\\/g, '/');
  const document: ScannedDocument = {
    absolutePath: input.source.filePath,
    content: input.content,
    extension: 'md',
    fileName: path.basename(input.source.sourceName),
    modifiedAt: new Date(input.source.mtimeMs).toISOString(),
    modifiedMs: Math.round(input.source.mtimeMs),
    relativePath,
    sizeBytes: input.source.sizeBytes
  };
  upsertExternalDocuments(buildReadwiseExternalFolder(input.kind, input.primaryPath, input.indexedAt), [document], input.indexedAt);
  return { documentId: buildReadwiseExternalDocumentId(input.kind, relativePath) };
}

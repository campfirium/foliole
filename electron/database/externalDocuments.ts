import { createHash } from 'node:crypto';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';
import type { ScannedDocument } from './externalSearchCacheSupport.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export interface MissingExternalDocument {
  relativePath: string;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function toDocumentId(folderId: string, relativePath: string) {
  return `${folderId}:${relativePath}`;
}

function toExternalDocumentPayload(folder: NativeExternalSearchFolder, document: ScannedDocument, indexedAt: string) {
  const title = resolveImportedNodeTitle({
    content: document.content,
    sourceName: document.relativePath,
    titleStrategy: 'heading'
  });
  return {
    content: document.content,
    content_hash: sha256(document.content),
    extension: document.extension,
    file_name: document.fileName,
    folder_id: folder.id,
    indexed_at: indexedAt,
    opening_text: resolveNodeOpeningText(document.content, title),
    relative_path: document.relativePath,
    source_modified_at: document.modifiedAt,
    source_modified_ms: document.modifiedMs,
    source_size_bytes: document.sizeBytes,
    title
  };
}

function recordExternalDocumentSync(args: {
  contentHash: string;
  hostName: string;
  documentId: string;
  updatedAt: string;
}) {
  const connection = openDatabaseConnection();
  upsertSyncObjectState(connection.driver, {
    objectType: 'external_document',
    objectId: args.documentId,
    contentHash: args.contentHash,
    lastModifiedByHostName: args.hostName,
    updatedAt: args.updatedAt,
    syncDirty: true
  });
}

function tombstoneExternalDocument(documentId: string, hostName: string, deletedAt: string) {
  const connection = openDatabaseConnection();
  const contentHash = computeSyncContentHash('external_document', { deleted_at: deletedAt, document_id: documentId });
  connection.driver.execute(
    `UPDATE external_documents
     SET is_present = 0, missing_at = ?, updated_at = ?
     WHERE document_id = ?`,
    [deletedAt, deletedAt, documentId]
  );
  upsertSyncObjectState(connection.driver, {
    objectType: 'external_document',
    objectId: documentId,
    contentHash,
    deletedAt,
    lastModifiedByHostName: hostName,
    updatedAt: deletedAt,
    syncDirty: true
  });
}

export function upsertExternalDocuments(folder: NativeExternalSearchFolder, documents: ScannedDocument[], indexedAt: string) {
  const connection = openDatabaseConnection();
  const hostName = loadOrCreateDesktopHostName(indexedAt);
  for (const document of documents) {
    const payload = toExternalDocumentPayload(folder, document, indexedAt);
    const documentId = toDocumentId(folder.id, document.relativePath);
    const syncContentHash = computeSyncContentHash('external_document', payload);
    const bodyBlobHash = upsertTextBodyBlob(connection.driver, payload.content, indexedAt);
    connection.driver.execute(
      `INSERT INTO external_documents (
         document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
         source_modified_at, source_modified_ms, content_hash, title, opening_text,
         body_blob_hash, content, indexed_at, is_present, missing_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET
         relative_path = excluded.relative_path,
         file_name = excluded.file_name,
         extension = excluded.extension,
         source_size_bytes = excluded.source_size_bytes,
         source_modified_at = excluded.source_modified_at,
         source_modified_ms = excluded.source_modified_ms,
         content_hash = excluded.content_hash,
         title = excluded.title,
         opening_text = excluded.opening_text,
         body_blob_hash = excluded.body_blob_hash,
         content = excluded.content,
         indexed_at = excluded.indexed_at,
         is_present = 1,
         missing_at = NULL,
         updated_at = excluded.updated_at`,
      [
        documentId,
        payload.folder_id,
        payload.relative_path,
        payload.file_name,
        payload.extension,
        payload.source_size_bytes,
        payload.source_modified_at,
        payload.source_modified_ms,
        payload.content_hash,
        payload.title,
        payload.opening_text,
        bodyBlobHash,
        payload.content,
        payload.indexed_at,
        indexedAt,
        indexedAt
      ]
    );
    recordExternalDocumentSync({
      contentHash: syncContentHash,
      hostName,
      documentId,
      updatedAt: indexedAt
    });
  }
}

export function replaceExternalDocumentsForFolder(
  folder: NativeExternalSearchFolder,
  documents: ScannedDocument[],
  indexedAt: string
) {
  const existing = openDatabaseConnection().driver.queryAll<{ document_id: string; relative_path: string }>(
    'SELECT document_id, relative_path FROM external_documents WHERE folder_id = ? AND is_present = 1',
    [folder.id]
  );
  const nextRelativePaths = new Set(documents.map((document) => document.relativePath));
  upsertExternalDocuments(folder, documents, indexedAt);
  const hostName = loadOrCreateDesktopHostName(indexedAt);
  for (const row of existing) {
    if (!nextRelativePaths.has(row.relative_path)) {
      tombstoneExternalDocument(row.document_id, hostName, indexedAt);
    }
  }
}

export function markExternalDocumentsMissing(missing: MissingExternalDocument[], folderId: string, missingAt: string) {
  const hostName = loadOrCreateDesktopHostName(missingAt);
  for (const document of missing) {
    tombstoneExternalDocument(toDocumentId(folderId, document.relativePath), hostName, missingAt);
  }
}

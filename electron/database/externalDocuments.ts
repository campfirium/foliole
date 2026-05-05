import { createHash, randomUUID } from 'node:crypto';

import { appendSyncChangeLog, computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import type { ScannedDocument } from './externalSearchCacheSupport.js';

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
    contentHash: sha256(document.content),
    extension: document.extension,
    fileName: document.fileName,
    folderId: folder.id,
    indexedAt,
    openingText: resolveNodeOpeningText(document.content, title),
    relativePath: document.relativePath,
    sourceModifiedAt: document.modifiedAt,
    sourceModifiedMs: document.modifiedMs,
    sourceSizeBytes: document.sizeBytes,
    title
  };
}

function recordExternalDocumentSync(args: {
  contentHash: string;
  deviceId: string;
  documentId: string;
  payloadJson: string;
  updatedAt: string;
}) {
  const connection = openDatabaseConnection();
  upsertSyncObjectState(connection.driver, {
    objectType: 'external_document',
    objectId: args.documentId,
    contentHash: args.contentHash,
    lastModifiedByDeviceId: args.deviceId,
    updatedAt: args.updatedAt,
    syncDirty: true
  });
  appendSyncChangeLog(connection.driver, {
    changeId: randomUUID(),
    objectType: 'external_document',
    objectId: args.documentId,
    changeType: 'upsert',
    deviceId: args.deviceId,
    contentHash: args.contentHash,
    payloadJson: args.payloadJson,
    createdAt: args.updatedAt,
    appliedAt: args.updatedAt
  });
}

function tombstoneExternalDocument(documentId: string, deviceId: string, deletedAt: string) {
  const connection = openDatabaseConnection();
  const contentHash = computeSyncContentHash('external_document', { deletedAt, documentId });
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
    lastModifiedByDeviceId: deviceId,
    updatedAt: deletedAt,
    syncDirty: true
  });
  appendSyncChangeLog(connection.driver, {
    changeId: randomUUID(),
    objectType: 'external_document',
    objectId: documentId,
    changeType: 'delete',
    deviceId,
    contentHash,
    payloadJson: JSON.stringify({ documentId }),
    createdAt: deletedAt,
    appliedAt: deletedAt
  });
}

export function upsertExternalDocuments(folder: NativeExternalSearchFolder, documents: ScannedDocument[], indexedAt: string) {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(indexedAt);
  for (const document of documents) {
    const payload = toExternalDocumentPayload(folder, document, indexedAt);
    const documentId = toDocumentId(folder.id, document.relativePath);
    const syncContentHash = computeSyncContentHash('external_document', payload);
    connection.driver.execute(
      `INSERT INTO external_documents (
         document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
         source_modified_at, source_modified_ms, content_hash, title, opening_text,
         content, indexed_at, is_present, missing_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
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
         content = excluded.content,
         indexed_at = excluded.indexed_at,
         is_present = 1,
         missing_at = NULL,
         updated_at = excluded.updated_at`,
      [
        documentId,
        payload.folderId,
        payload.relativePath,
        payload.fileName,
        payload.extension,
        payload.sourceSizeBytes,
        payload.sourceModifiedAt,
        payload.sourceModifiedMs,
        payload.contentHash,
        payload.title,
        payload.openingText,
        payload.content,
        payload.indexedAt,
        indexedAt,
        indexedAt
      ]
    );
    recordExternalDocumentSync({
      contentHash: syncContentHash,
      deviceId,
      documentId,
      payloadJson: JSON.stringify({ documentId, ...payload }),
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
  const deviceId = loadOrCreateDesktopDeviceId(indexedAt);
  for (const row of existing) {
    if (!nextRelativePaths.has(row.relative_path)) {
      tombstoneExternalDocument(row.document_id, deviceId, indexedAt);
    }
  }
}

export function markExternalDocumentsMissing(missing: MissingExternalDocument[], folderId: string, missingAt: string) {
  const deviceId = loadOrCreateDesktopDeviceId(missingAt);
  for (const document of missing) {
    tombstoneExternalDocument(toDocumentId(folderId, document.relativePath), deviceId, missingAt);
  }
}

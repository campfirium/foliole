import { createHash } from 'node:crypto';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import {
  buildReadwiseExternalDisplayLocation,
  buildReadwiseExternalDocumentId,
  parseReadwiseExternalReference,
  serializeReadwiseExternalReference
} from '../../lib/core/readwise/readwiseExternalReference.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { buildReadwiseExternalFolderId } from './readwiseManagedExternalDocuments.js';

export function upsertReadwiseApiExternalDocument(input: {
  connectionRef: string;
  document: PreparedReadwiseApiDocument;
  indexedAt: string;
}) {
  const connection = openDatabaseConnection();
  const documentId = buildReadwiseExternalDocumentId(input.connectionRef, input.document.id);
  const relativePath = buildReadwiseExternalDisplayLocation(input.document.title, input.document.id);
  const referenceJson = serializeReadwiseExternalReference({
    connection_ref: input.connectionRef,
    reader_url: input.document.metadata.readerUrl,
    remote_document_id: input.document.id,
    source_url: input.document.metadata.sourceUrl
  });
  const contentHash = sha256(input.document.body);
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, input.document.body, input.indexedAt);
  const payload = {
    body_blob_hash: bodyBlobHash,
    content: input.document.body,
    content_hash: contentHash,
    created_at: input.indexedAt,
    document_id: documentId,
    extension: 'md',
    file_name: relativePath,
    folder_id: buildReadwiseExternalFolderId(resolveFolderKind(input.document.category)),
    indexed_at: input.indexedAt,
    is_present: 1,
    missing_at: null,
    opening_text: resolveNodeOpeningText(input.document.body, input.document.title),
    reference_json: referenceJson,
    reference_kind: 'readwise_remote',
    relative_path: relativePath,
    source_modified_at: input.document.updatedAt ?? input.indexedAt,
    source_modified_ms: Date.parse(input.document.updatedAt ?? input.indexedAt),
    source_size_bytes: Buffer.byteLength(input.document.body),
    title: input.document.title,
    updated_at: input.indexedAt
  };
  connection.driver.execute(`INSERT INTO external_documents (
      document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
      source_modified_ms, content_hash, title, opening_text, body_blob_hash, content, reference_kind,
      reference_json, indexed_at, is_present, missing_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      folder_id=excluded.folder_id, relative_path=excluded.relative_path, file_name=excluded.file_name,
      source_size_bytes=excluded.source_size_bytes, source_modified_at=excluded.source_modified_at,
      source_modified_ms=excluded.source_modified_ms, content_hash=excluded.content_hash, title=excluded.title,
      opening_text=excluded.opening_text, body_blob_hash=excluded.body_blob_hash, content=excluded.content,
      reference_kind=excluded.reference_kind, reference_json=excluded.reference_json, indexed_at=excluded.indexed_at,
      is_present=1, missing_at=NULL, updated_at=excluded.updated_at`, [
    payload.document_id, payload.folder_id, payload.relative_path, payload.file_name, payload.extension,
    payload.source_size_bytes, payload.source_modified_at, payload.source_modified_ms, payload.content_hash,
    payload.title, payload.opening_text, payload.body_blob_hash, payload.content, payload.reference_kind,
    payload.reference_json, payload.indexed_at, payload.is_present, payload.missing_at, payload.created_at,
    payload.updated_at
  ]);
  recordSync(documentId, payload, input.indexedAt);
  return { documentId };
}

export function hideReadwiseApiExternalDocument(connectionRef: string, remoteDocumentId: string, updatedAt: string) {
  const documentId = buildReadwiseExternalDocumentId(connectionRef, remoteDocumentId);
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ is_present: number }>(
    'SELECT is_present FROM external_documents WHERE document_id = ?', [documentId]
  );
  if (!row || row.is_present === 0) return;
  connection.driver.execute(
    'UPDATE external_documents SET is_present = 0, missing_at = ?, updated_at = ? WHERE document_id = ?',
    [updatedAt, updatedAt, documentId]
  );
  const hash = computeSyncContentHash('external_document', { deleted_at: updatedAt, document_id: documentId });
  upsertSyncObjectState(connection.driver, {
    contentHash: hash, deletedAt: updatedAt, lastModifiedByHostName: loadOrCreateDesktopHostName(updatedAt),
    objectId: documentId, objectType: 'external_document', syncDirty: true, updatedAt
  });
}

export function loadReadwiseApiExternalReference(documentId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ reference_json: string | null; reference_kind: string }>(
    'SELECT reference_kind, reference_json FROM external_documents WHERE document_id = ? AND is_present = 1', [documentId]
  );
  return row?.reference_kind === 'readwise_remote' ? parseReadwiseExternalReference(row.reference_json) : null;
}

export function loadReadwiseApiExternalDocumentState(connectionRef: string, remoteDocumentId: string) {
  return openDatabaseConnection().driver.queryOne<{
    content_hash: string;
    is_present: number;
    source_modified_at: string;
  }>(
    `SELECT content_hash, is_present, source_modified_at FROM external_documents
     WHERE document_id = ?`,
    [buildReadwiseExternalDocumentId(connectionRef, remoteDocumentId)]
  ) ?? null;
}

export function hasActiveReadwiseApiExternalDocument(connectionRef: string, remoteDocumentId: string) {
  return loadReadwiseApiExternalDocumentState(connectionRef, remoteDocumentId)?.is_present === 1;
}

export function hasReadwiseApiExternalDocumentChanged(
  connectionRef: string,
  document: PreparedReadwiseApiDocument
) {
  const state = loadReadwiseApiExternalDocumentState(connectionRef, document.id);
  return Boolean(state && (
    state.content_hash !== sha256(document.body)
    || state.source_modified_at !== (document.updatedAt ?? state.source_modified_at)
  ));
}

export function hideReadwiseApiExternalDocumentsExcept(
  connectionRef: string,
  retainedRemoteIds: ReadonlySet<string>,
  updatedAt = new Date().toISOString()
) {
  const rows = openDatabaseConnection().driver.queryAll<{
    document_id: string;
    reference_json: string | null;
  }>(
    `SELECT document_id, reference_json FROM external_documents
     WHERE reference_kind = 'readwise_remote' AND is_present = 1`
  );
  let hiddenCount = 0;
  for (const row of rows) {
    const reference = parseReadwiseExternalReference(row.reference_json);
    if (!reference || reference.connection_ref !== connectionRef
      || retainedRemoteIds.has(reference.remote_document_id)) continue;
    hideReadwiseApiExternalDocument(connectionRef, reference.remote_document_id, updatedAt);
    hiddenCount += 1;
  }
  return hiddenCount;
}

function recordSync(
  documentId: string,
  payload: Parameters<typeof computeSyncContentHash>[1],
  updatedAt: string
) {
  const connection = openDatabaseConnection();
  upsertSyncObjectState(connection.driver, {
    contentHash: computeSyncContentHash('external_document', payload),
    lastModifiedByHostName: loadOrCreateDesktopHostName(updatedAt), objectId: documentId,
    objectType: 'external_document', syncDirty: true, updatedAt
  });
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function resolveFolderKind(category: PreparedReadwiseApiDocument['category']): ReadwiseSourceKind {
  if (category === 'epub' || category === 'pdf') return 'books';
  if (category === 'tweet') return 'tweets';
  if (category === 'video') return 'podcasts';
  return 'articles';
}

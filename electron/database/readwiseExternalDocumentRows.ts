import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { parseReadwiseExternalReference } from '../../lib/core/readwise/readwiseExternalReference.js';

import { openDatabaseConnection } from './connection.js';

export const READWISE_EXTERNAL_FOLDER_PREFIX = 'readwise-reader-import';

export function buildReadwiseExternalFolderId(kind: ReadwiseSourceKind) {
  return `${READWISE_EXTERNAL_FOLDER_PREFIX}-${kind}`;
}

export function isReadwiseExternalFolderId(folderId: string) {
  return folderId.startsWith(`${READWISE_EXTERNAL_FOLDER_PREFIX}-`);
}

export interface ReadwiseExternalDocumentRow {
  content: string;
  document_id: string;
  extension: 'md' | 'txt';
  file_name: string;
  folder_id: string;
  opening_text: string | null;
  reference_json: string | null;
  reference_kind: string;
  relative_path: string;
  source_modified_at: string;
  title: string;
  updated_at: string;
}

export interface ReadwiseExternalFolderRow {
  document_count: number;
  folder_id: string;
  indexed_at: string | null;
}

export function readRemoteReference(row: ReadwiseExternalDocumentRow) {
  return row.reference_kind === 'readwise_remote' ? parseReadwiseExternalReference(row.reference_json) : null;
}

export function hasRemoteImportBinding(row: ReadwiseExternalDocumentRow) {
  const reference = readRemoteReference(row);
  if (!reference) return false;
  return Boolean(openDatabaseConnection().driver.queryOne(
    `SELECT source_fingerprint FROM import_sources
     WHERE remote_provider = 'readwise' AND remote_connection_ref = ? AND remote_document_id = ? LIMIT 1`,
    [reference.connection_ref, reference.remote_document_id]
  ));
}

export function readReadwiseExternalDocumentRows(folderId?: string) {
  const filter = folderId ? 'AND folder_id = ?' : '';
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT document_id, folder_id, relative_path, file_name, extension, source_modified_at,
              content, title, opening_text, reference_kind, reference_json, updated_at
       FROM external_documents
       WHERE is_present = 1
         AND folder_id LIKE '${READWISE_EXTERNAL_FOLDER_PREFIX}-%'
         ${filter}
       ORDER BY relative_path COLLATE NOCASE ASC`
    )
    .all(...(folderId ? [folderId] : [])) as ReadwiseExternalDocumentRow[];
}

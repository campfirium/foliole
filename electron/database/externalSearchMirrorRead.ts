import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchPreview
} from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';

interface MirrorDocumentRow extends DatabaseRow {
  content: string;
  document_id: string;
  extension: 'md' | 'txt';
  file_name: string;
  folder_id: string;
  opening_text: string | null;
  relative_path: string;
  source_modified_at: string;
  source_size_bytes: number;
  title: string | null;
}

function loadEnabledRemoteFolder(folderId: string) {
  return loadExternalSearchFolders().find((folder) =>
    folder.id === folderId && folder.access_mode === 'remote_mirror' && folder.mirror_enabled !== false
  ) ?? null;
}

function readMirrorDocument(documentId: string) {
  return openDatabaseConnection().driver.queryOne<MirrorDocumentRow>(
    `SELECT d.document_id, d.folder_id, d.relative_path, d.file_name, d.extension,
      d.source_size_bytes, d.source_modified_at, d.title, d.opening_text,
      COALESCE(CAST(cbd.data AS TEXT), d.content) AS content
     FROM external_documents d
     LEFT JOIN content_blob_data cbd ON cbd.hash = d.body_blob_hash
     WHERE d.document_id = ? AND d.is_present = 1`,
    [documentId]
  ) ?? null;
}

function toBrowseEntry(row: MirrorDocumentRow, folderPath: string): NativeExternalSearchBrowseEntry {
  return {
    document_id: row.document_id,
    extension: row.extension === 'txt' ? 'txt' : 'md',
    file_name: row.file_name,
    file_size: row.source_size_bytes,
    folder_id: row.folder_id,
    folder_path: folderPath,
    imported_node_id: null,
    is_present: true,
    modified_at: row.source_modified_at,
    opening_text: row.opening_text,
    reference: { document_id: row.document_id, kind: 'mirror_document' },
    relative_path: row.relative_path,
    source_kind: 'external_document',
    title: row.title?.trim() || row.file_name
  };
}

export function loadExternalSearchMirrorBrowseEntries(folderId: string) {
  const folder = loadEnabledRemoteFolder(folderId);
  if (!folder) return null;
  const rows = openDatabaseConnection().driver.queryAll<MirrorDocumentRow>(
    `SELECT d.document_id, d.folder_id, d.relative_path, d.file_name, d.extension,
      d.source_size_bytes, d.source_modified_at, d.title, d.opening_text, '' AS content
     FROM external_documents d
     WHERE d.folder_id = ? AND d.is_present = 1
     ORDER BY d.relative_path COLLATE NOCASE ASC`,
    [folderId]
  );
  return rows.map((row) => toBrowseEntry(row, folder.folder_path));
}

export function loadExternalSearchMirrorPreview(documentId: string): NativeExternalSearchPreview | null {
  const row = readMirrorDocument(documentId);
  if (!row) return null;
  const folder = loadEnabledRemoteFolder(row.folder_id);
  if (!folder) return null;
  return {
    content: row.content,
    document_id: row.document_id,
    editable: false,
    extension: row.extension === 'txt' ? 'txt' : 'md',
    file_name: row.file_name,
    file_size: row.source_size_bytes,
    folder_id: row.folder_id,
    folder_path: folder.folder_path,
    imported_node_id: null,
    is_present: true,
    modified_at: row.source_modified_at,
    reference: { document_id: row.document_id, kind: 'mirror_document' },
    relative_path: row.relative_path,
    source_kind: 'external_document'
  };
}

export function loadExternalSearchMirrorImportSource(documentId: string) {
  const preview = loadExternalSearchMirrorPreview(documentId);
  return preview ? { content: preview.content, fileName: preview.file_name } : null;
}

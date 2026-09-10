import path from 'node:path';

import { matchesFtsSearchText, type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import type { ReadwiseSourceKind } from '../../lib/core/import/importManagerSettings.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder,
  NativeExternalSearchPreview
} from '../../lib/platform/nativeStorageContract.js';
import { loadImportManagerSettings } from '../import/importManagerSettings.js';

import { openDatabaseConnection } from './connection.js';
import {
  isExternalDocumentVisible,
  loadActiveImportedSourceLocatorNodeIds,
  loadActiveImportedSourceLocators,
  resolveImportedNodeIdForExternalDocument
} from './externalDocumentImportVisibility.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import {
  buildReadwiseExternalFolderId,
  hasRemoteImportBinding,
  isReadwiseExternalFolderId,
  readReadwiseExternalDocumentRows,
  readRemoteReference,
  type ReadwiseExternalDocumentRow,
  type ReadwiseExternalFolderRow
} from './readwiseExternalDocumentRows.js';

export function buildReadwiseExternalDocumentId(kind: ReadwiseSourceKind, sourceName: string) {
  return `${buildReadwiseExternalFolderId(kind)}:${sourceName.replace(/\\/g, '/')}`;
}

export { buildReadwiseExternalFolderId, isReadwiseExternalFolderId };

export function hasReadwiseExternalDocument(kind: ReadwiseSourceKind, sourceName: string) {
  const documentId = buildReadwiseExternalDocumentId(kind, sourceName);
  const row = openDatabaseConnection().sqlite
    .prepare('SELECT is_present FROM external_documents WHERE document_id = ?')
    .get(documentId) as { is_present: number } | undefined;
  return row?.is_present === 1;
}

export function hideReadwiseExternalDocument(
  kind: ReadwiseSourceKind,
  sourceName: string,
  updatedAt = new Date().toISOString()
) {
  const documentId = buildReadwiseExternalDocumentId(kind, sourceName);
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ is_present: number }>(
    'SELECT is_present FROM external_documents WHERE document_id = ?', [documentId]
  );
  if (!row || row.is_present === 0) return;
  connection.driver.execute(
    `UPDATE external_documents SET is_present = 0, missing_at = ?, updated_at = ?
     WHERE document_id = ? AND is_present = 1`,
    [updatedAt, updatedAt, documentId]
  );
  upsertSyncObjectState(connection.driver, {
    contentHash: computeSyncContentHash('external_document', {
      deleted_at: updatedAt,
      document_id: documentId
    }),
    deletedAt: updatedAt,
    lastModifiedByHostName: loadOrCreateDesktopHostName(updatedAt),
    objectId: documentId,
    objectType: 'external_document',
    syncDirty: true,
    updatedAt
  });
}

function resolveReadwiseFolderPath(folderId: string) {
  const settings = loadImportManagerSettings();
  const source = settings.readwiseSources.find(
    (entry) => entry.kind && buildReadwiseExternalFolderId(entry.kind) === folderId
  );
  return source?.primaryPath.trim() ?? '';
}

function resolveDocumentAbsolutePath(row: ReadwiseExternalDocumentRow) {
  const folderPath = resolveReadwiseFolderPath(row.folder_id);
  return folderPath ? path.join(folderPath, row.relative_path) : row.relative_path;
}

function resolveDocumentKey(row: ReadwiseExternalDocumentRow) {
  return row.reference_kind === 'readwise_remote'
    ? `readwise-document:${row.document_id}`
    : resolveDocumentAbsolutePath(row);
}

function toBrowseEntry(row: ReadwiseExternalDocumentRow, importedNodeId: string | null = null): NativeExternalSearchBrowseEntry {
  const title =
    row.title ||
    resolveImportedNodeTitle({
      content: row.content,
      sourceName: row.relative_path,
      titleStrategy: 'heading'
    });
  const remote = readRemoteReference(row);
  if (remote) {
    return {
      document_id: row.document_id,
      extension: row.extension,
      file_name: row.file_name,
      folder_id: row.folder_id,
      folder_path: 'Readwise',
      imported_node_id: importedNodeId,
      modified_at: row.source_modified_at,
      opening_text: row.opening_text ?? resolveNodeOpeningText(row.content, title),
      reference: {
        document_id: row.document_id,
        kind: 'readwise_remote',
        reader_url: remote.reader_url,
        source_url: remote.source_url
      },
      relative_path: row.relative_path,
      source_kind: 'external_document',
      title
    };
  }
  const absolutePath = resolveDocumentAbsolutePath(row);
  return {
    absolute_path: absolutePath,
    extension: row.extension,
    file_name: row.file_name,
    folder_id: row.folder_id,
    folder_path: resolveReadwiseFolderPath(row.folder_id),
    imported_node_id: importedNodeId,
    modified_at: row.source_modified_at,
    opening_text: row.opening_text ?? resolveNodeOpeningText(row.content, title),
    reference: { absolute_path: absolutePath, kind: 'local_path' },
    relative_path: row.relative_path,
    title
  };
}

export function loadReadwiseExternalSearchFolders(): NativeExternalSearchFolder[] {
  const grouped = new Map<string, ReadwiseExternalFolderRow>();
  readReadwiseExternalDocumentRows().filter((row) => !hasRemoteImportBinding(row)).forEach((row) => {
    const current = grouped.get(row.folder_id);
    grouped.set(row.folder_id, {
      document_count: (current?.document_count ?? 0) + 1,
      folder_id: row.folder_id,
      indexed_at: !current?.indexed_at || current.indexed_at < row.updated_at ? row.updated_at : current.indexed_at
    });
  });
  const rows = [...grouped.values()].sort((left, right) => left.folder_id.localeCompare(right.folder_id));
  return rows.map((row) => {
    const indexedAt = row.indexed_at ?? new Date(0).toISOString();
    return {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      created_at: indexedAt,
      document_count: row.document_count,
      excluded_dirs: [],
      folder_path: resolveReadwiseFolderPath(row.folder_id),
      id: row.folder_id,
      indexed_at: row.indexed_at,
      last_error: null,
      source_executable: true,
      source_host_name: loadOrCreateDesktopHostName(),
      source_host_platform: process.platform,
      status: 'ready',
      updated_at: indexedAt
    };
  });
}

export function loadReadwiseExternalSearchBrowseEntries(folderId: string) {
  const importedNodeIdsByLocator = loadActiveImportedSourceLocatorNodeIds();
  return readReadwiseExternalDocumentRows(folderId)
    .filter((row) => !hasRemoteImportBinding(row))
    .map((row) => {
      if (readRemoteReference(row)) return toBrowseEntry(row);
      const absolutePath = resolveDocumentAbsolutePath(row);
      return toBrowseEntry(row, resolveImportedNodeIdForExternalDocument(absolutePath, importedNodeIdsByLocator));
    });
}

export function loadReadwiseExternalSearchPreview(
  documentKey: string
): NativeExternalSearchPreview | null {
  const row = readReadwiseExternalDocumentRows().find(
    (entry) => resolveDocumentKey(entry) === documentKey || entry.document_id === documentKey
  );
  if (!row || hasRemoteImportBinding(row)) {
    return null;
  }
  const remote = readRemoteReference(row);
  if (remote) {
    return {
      content: row.content,
      document_id: row.document_id,
      extension: row.extension,
      file_name: row.file_name,
      folder_id: row.folder_id,
      folder_path: 'Readwise',
      imported_node_id: null,
      reference: {
        document_id: row.document_id,
        kind: 'readwise_remote',
        reader_url: remote.reader_url,
        source_url: remote.source_url
      },
      relative_path: row.relative_path,
      source_kind: 'external_document'
    };
  }
  const absolutePath = resolveDocumentAbsolutePath(row);
  return {
    absolute_path: absolutePath,
    content: row.content,
    extension: row.extension,
    file_name: row.file_name,
    folder_id: row.folder_id,
    folder_path: resolveReadwiseFolderPath(row.folder_id),
    imported_node_id: resolveImportedNodeIdForExternalDocument(absolutePath),
    reference: { absolute_path: absolutePath, kind: 'local_path' },
    relative_path: row.relative_path
  };
}

export function searchReadwiseExternalDocuments(queryPlan: FtsSearchQueryPlan) {
  const normalizedQuery = queryPlan.normalizedQuery;
  if (!normalizedQuery) {
    return [];
  }
  const activeImportedLocators = loadActiveImportedSourceLocators();
  const importedNodeIdsByLocator = loadActiveImportedSourceLocatorNodeIds();
  return readReadwiseExternalDocumentRows()
    .filter((row) => readRemoteReference(row)
      ? !hasRemoteImportBinding(row)
      : isExternalDocumentVisible(resolveDocumentAbsolutePath(row), activeImportedLocators))
    .filter((row) => matchesFtsSearchText([row.file_name, row.relative_path, row.content].join(' '), queryPlan))
    .slice(0, 20)
    .map((row) => ({
      excerpt: row.opening_text ?? resolveNodeOpeningText(row.content, row.title) ?? '',
      externalMatch: {
        absolutePath: resolveDocumentKey(row),
        folderId: row.folder_id,
        folderPath: resolveReadwiseFolderPath(row.folder_id),
        importedNodeId: readRemoteReference(row) ? null
          : resolveImportedNodeIdForExternalDocument(resolveDocumentAbsolutePath(row), importedNodeIdsByLocator),
        query: queryPlan.highlightQuery,
        relativePath: row.relative_path,
        sourceKind: 'external' as const
      },
      id: resolveDocumentKey(row),
      kind: 'external',
      nodeMatch: null,
      pdfMatch: null,
      title: row.file_name,
      updatedAt: row.source_modified_at
    }));
}

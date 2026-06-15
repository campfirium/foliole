import path from 'node:path';

import { matchesFtsSearchText, type FtsSearchQueryPlan } from '../../lib/core/database/ftsSearchQuery.js';
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

const READWISE_EXTERNAL_FOLDER_PREFIX = 'readwise-reader-import';

interface ReadwiseExternalDocumentRow {
  content: string;
  document_id: string;
  extension: 'md' | 'txt';
  file_name: string;
  folder_id: string;
  opening_text: string | null;
  relative_path: string;
  source_modified_at: string;
  title: string;
  updated_at: string;
}

interface ReadwiseExternalFolderRow {
  document_count: number;
  folder_id: string;
  indexed_at: string | null;
}

export function buildReadwiseExternalFolderId(kind: ReadwiseSourceKind) {
  return `${READWISE_EXTERNAL_FOLDER_PREFIX}-${kind}`;
}

export function buildReadwiseExternalDocumentId(kind: ReadwiseSourceKind, sourceName: string) {
  return `${buildReadwiseExternalFolderId(kind)}:${sourceName.replace(/\\/g, '/')}`;
}

export function isReadwiseExternalFolderId(folderId: string) {
  return folderId.startsWith(`${READWISE_EXTERNAL_FOLDER_PREFIX}-`);
}

export function hasReadwiseExternalDocument(kind: ReadwiseSourceKind, sourceName: string) {
  const documentId = buildReadwiseExternalDocumentId(kind, sourceName);
  const row = openDatabaseConnection().sqlite
    .prepare('SELECT is_present FROM external_documents WHERE document_id = ?')
    .get(documentId) as { is_present: number } | undefined;
  return row?.is_present === 1;
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

function readReadwiseExternalDocumentRows(folderId?: string) {
  const filter = folderId ? 'AND folder_id = ?' : '';
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT document_id, folder_id, relative_path, file_name, extension, source_modified_at,
              content, title, opening_text, updated_at
       FROM external_documents
       WHERE is_present = 1
         AND folder_id LIKE '${READWISE_EXTERNAL_FOLDER_PREFIX}-%'
         ${filter}
       ORDER BY relative_path COLLATE NOCASE ASC`
    )
    .all(...(folderId ? [folderId] : [])) as ReadwiseExternalDocumentRow[];
}

function toBrowseEntry(row: ReadwiseExternalDocumentRow, importedNodeId: string | null = null): NativeExternalSearchBrowseEntry {
  const title =
    row.title ||
    resolveImportedNodeTitle({
      content: row.content,
      sourceName: row.relative_path,
      titleStrategy: 'heading'
    });
  return {
    absolute_path: resolveDocumentAbsolutePath(row),
    extension: row.extension,
    file_name: row.file_name,
    folder_id: row.folder_id,
    folder_path: resolveReadwiseFolderPath(row.folder_id),
    imported_node_id: importedNodeId,
    modified_at: row.source_modified_at,
    opening_text: row.opening_text ?? resolveNodeOpeningText(row.content, title),
    relative_path: row.relative_path,
    title
  };
}

export function loadReadwiseExternalSearchFolders(): NativeExternalSearchFolder[] {
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT folder_id, COUNT(*) AS document_count, MAX(updated_at) AS indexed_at
       FROM external_documents
       WHERE is_present = 1
         AND folder_id LIKE '${READWISE_EXTERNAL_FOLDER_PREFIX}-%'
       GROUP BY folder_id
       ORDER BY folder_id ASC`
    )
    .all() as ReadwiseExternalFolderRow[];
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
      status: 'ready',
      updated_at: indexedAt
    };
  });
}

export function loadReadwiseExternalSearchBrowseEntries(folderId: string) {
  const importedNodeIdsByLocator = loadActiveImportedSourceLocatorNodeIds();
  return readReadwiseExternalDocumentRows(folderId)
    .map((row) => {
      const absolutePath = resolveDocumentAbsolutePath(row);
      return toBrowseEntry(row, resolveImportedNodeIdForExternalDocument(absolutePath, importedNodeIdsByLocator));
    });
}

export function loadReadwiseExternalSearchPreview(
  absolutePath: string
): NativeExternalSearchPreview | null {
  const row = readReadwiseExternalDocumentRows().find(
    (entry) => resolveDocumentAbsolutePath(entry) === absolutePath
  );
  if (!row) {
    return null;
  }
  return {
    absolute_path: absolutePath,
    content: row.content,
    extension: row.extension,
    file_name: row.file_name,
    folder_id: row.folder_id,
    folder_path: resolveReadwiseFolderPath(row.folder_id),
    imported_node_id: resolveImportedNodeIdForExternalDocument(absolutePath),
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
    .filter((row) => isExternalDocumentVisible(resolveDocumentAbsolutePath(row), activeImportedLocators))
    .filter((row) => matchesFtsSearchText([row.file_name, row.relative_path, row.content].join(' '), queryPlan))
    .slice(0, 20)
    .map((row) => ({
      excerpt: row.opening_text ?? resolveNodeOpeningText(row.content, row.title) ?? '',
      externalMatch: {
        absolutePath: resolveDocumentAbsolutePath(row),
        folderId: row.folder_id,
        folderPath: resolveReadwiseFolderPath(row.folder_id),
        importedNodeId: resolveImportedNodeIdForExternalDocument(resolveDocumentAbsolutePath(row), importedNodeIdsByLocator),
        query: queryPlan.highlightQuery,
        relativePath: row.relative_path,
        sourceKind: 'external' as const
      },
      id: resolveDocumentAbsolutePath(row),
      kind: 'external',
      nodeMatch: null,
      pdfMatch: null,
      title: row.file_name,
      updatedAt: row.source_modified_at
    }));
}

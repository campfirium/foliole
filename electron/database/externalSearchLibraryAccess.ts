import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type { NativeExternalSearchBrowseEntry, NativeExternalSearchPreview } from '../../lib/platform/nativeStorageContract.js';

import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { type ExternalSearchRow, toExternalResult } from './externalSearchCacheSupport.js';
import { loadExternalSearchFolders } from './externalSearchFolders.js';
import { resolveExternalPreviewSourceContent, rewriteExternalPreviewContent } from './externalSearchPreviewContent.js';
import {
  isReadwiseExternalFolderId,
  isReadwiseExternalPath,
  loadReadwiseExternalBrowseEntries,
  loadReadwiseExternalPreview,
  searchReadwiseExternalDocuments
} from './readwiseExternalLibrary.js';

export function searchExternalDocuments(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const rows = readExternalSearchRows(normalizedQuery);
  return [...rows.map((row) => toExternalResult(row, normalizedQuery)), ...searchReadwiseExternalDocuments(normalizedQuery)];
}

export function loadExternalSearchBrowseEntries(folderId: string): NativeExternalSearchBrowseEntry[] {
  if (isReadwiseExternalFolderId(folderId)) return loadReadwiseExternalBrowseEntries();
  return (
    openExternalSearchCacheDatabase()
    .prepare(
      `SELECT absolute_path, content, extension, file_name, folder_id, folder_path, modified_at, relative_path
       FROM external_search_documents
       WHERE folder_id = ? AND is_present = 1
       ORDER BY relative_path COLLATE NOCASE ASC`
    )
    .all(folderId) as Array<{
      absolute_path: string;
      content: string;
      extension: 'md' | 'txt';
      file_name: string;
      folder_id: string;
      folder_path: string;
      modified_at: string;
      relative_path: string;
    }>
  ).map((row) => {
    const title = resolveImportedNodeTitle({
      content: row.content,
      sourceName: row.relative_path,
      titleStrategy: 'heading'
    });
    return {
      absolute_path: row.absolute_path,
      extension: row.extension,
      file_name: row.file_name,
      folder_id: row.folder_id,
      folder_path: row.folder_path,
      modified_at: row.modified_at,
      opening_text: resolveNodeOpeningText(row.content, title),
      relative_path: row.relative_path,
      title
    } satisfies NativeExternalSearchBrowseEntry;
  });
}

export function loadExternalSearchPreview(absolutePath: string): NativeExternalSearchPreview | null {
  if (isReadwiseExternalPath(absolutePath)) return loadReadwiseExternalPreview(absolutePath);
  const row = readExternalSearchPreviewRow(absolutePath);
  if (!row) return null;
  const folder = loadExternalSearchFolders().find((item) => item.id === row.folder_id) ?? null;
  const previewContent = resolveExternalPreviewSourceContent(row.content, row.absolute_path);
  return {
    ...row,
    content: row.extension === 'md' ? rewriteExternalPreviewContent(previewContent, row.absolute_path, folder) : previewContent
  };
}

function readExternalSearchRows(normalizedQuery: string) {
  const db = openExternalSearchCacheDatabase();
  if (normalizedQuery.length <= 2) {
    return db
      .prepare(
        `SELECT absolute_path, file_name, folder_id, folder_path, relative_path, content AS text,
          modified_at, 1000 AS rank
         FROM external_search_documents
         WHERE is_present = 1
           AND (instr(lower(file_name), ?) > 0
            OR instr(lower(relative_path), ?) > 0
            OR instr(lower(content), ?) > 0)
         ORDER BY modified_ms DESC
         LIMIT 20`
      )
      .all(normalizedQuery, normalizedQuery, normalizedQuery) as ExternalSearchRow[];
  }
  return db
    .prepare(
      `SELECT absolute_path, file_name, folder_id, folder_path, relative_path, content AS text,
        modified_at, bm25(external_search_fts, 8.0, 5.0, 3.0, 1.0) AS rank
       FROM external_search_fts
       WHERE external_search_fts MATCH ?
       ORDER BY rank ASC, modified_at DESC
       LIMIT 20`
    )
    .all(normalizedQuery) as ExternalSearchRow[];
}

function readExternalSearchPreviewRow(absolutePath: string) {
  return openExternalSearchCacheDatabase()
    .prepare(
      `SELECT absolute_path, folder_id, folder_path, relative_path, file_name, extension, content
       FROM external_search_documents
       WHERE absolute_path = ? AND is_present = 1`
    )
    .get(absolutePath) as {
    absolute_path: string;
    content: string;
    extension: 'md' | 'txt';
    file_name: string;
    folder_id: string;
    folder_path: string;
    relative_path: string;
  } | undefined;
}

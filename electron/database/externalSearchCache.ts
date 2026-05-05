import type { NativeExternalSearchBrowseEntry, NativeExternalSearchPreview } from '../../lib/platform/nativeStorageContract.js';

import { closeExternalSearchCacheDatabase, openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import {
  applyFolderDocumentChanges,
  loadScannedDocument,
  replaceFolderDocuments,
  scanFolder,
  scanFolderEntries,
  type ExternalSearchRow,
  type ScannedDocument,
  type ScannedDocumentEntry,
  toExternalResult
} from './externalSearchCacheSupport.js';
import { loadExternalSearchFolders, updateExternalSearchFolderIndexState } from './externalSearchFolders.js';
import { resolveExternalPreviewSourceContent, rewriteExternalPreviewContent } from './externalSearchPreviewContent.js';

type SqliteDatabase = import('better-sqlite3').Database;
interface CachedFolderDocumentRow { absolute_path: string; is_present: number; modified_ms: number; size_bytes: number }

function readCachedFolderDocuments(db: SqliteDatabase, folderId: string) {
  return db
    .prepare(
      `SELECT absolute_path, modified_ms, size_bytes, is_present
       FROM external_search_documents
       WHERE folder_id = ?`
    )
    .all(folderId) as CachedFolderDocumentRow[];
}

async function syncExternalSearchFolder(db: SqliteDatabase, folder: ReturnType<typeof loadExternalSearchFolders>[number]) {
  const defaultExcludedNames = new Set(['.git', '.obsidian', '.trash', 'node_modules']);
  const scannedEntries: ScannedDocumentEntry[] = [];
  await scanFolderEntries(folder, folder.folder_path, folder.folder_path, defaultExcludedNames, scannedEntries);

  const existingRows = readCachedFolderDocuments(db, folder.id);
  const existingByAbsolutePath = new Map(existingRows.map((row) => [row.absolute_path, row]));
  const seenAbsolutePaths = new Set<string>();
  const entriesToUpsert = scannedEntries.filter((entry) => {
    seenAbsolutePaths.add(entry.absolutePath);
    const existing = existingByAbsolutePath.get(entry.absolutePath);
    return !existing || existing.is_present !== 1 || existing.modified_ms !== entry.modifiedMs || existing.size_bytes !== entry.sizeBytes;
  });
  const deletedAbsolutePaths = existingRows
    .filter((row) => !seenAbsolutePaths.has(row.absolute_path))
    .map((row) => row.absolute_path);
  const documentsToUpsert: ScannedDocument[] = [];
  for (const entry of entriesToUpsert) {
    documentsToUpsert.push(await loadScannedDocument(entry));
  }
  return {
    documentCount: scannedEntries.length,
    indexedAt: applyFolderDocumentChanges({
      db,
      deletedAbsolutePaths,
      documentsToUpsert,
      folder
    })
  };
}

export async function rebuildExternalSearchIndexes(folderId?: string) {
  const defaultExcludedNames = new Set(['.git', '.obsidian', '.trash', 'node_modules']);
  const folders = loadExternalSearchFolders().filter((folder) => !folderId || folder.id === folderId);
  for (const folder of folders) {
    updateExternalSearchFolderIndexState({
      documentCount: folder.document_count,
      folderId: folder.id,
      indexedAt: folder.indexed_at,
      lastError: null,
      status: 'indexing'
    });
    try {
      const documents: ScannedDocument[] = [];
      await scanFolder(folder, folder.folder_path, folder.folder_path, defaultExcludedNames, documents);
      const indexedAt = replaceFolderDocuments(openExternalSearchCacheDatabase(), folder, documents);
      updateExternalSearchFolderIndexState({
        documentCount: documents.length,
        folderId: folder.id,
        indexedAt,
        lastError: null,
        status: 'ready'
      });
    } catch (error) {
      updateExternalSearchFolderIndexState({
        documentCount: 0,
        folderId: folder.id,
        indexedAt: null,
        lastError: error instanceof Error ? error.message : 'Unknown indexing error',
        status: 'error'
      });
    }
  }
  return loadExternalSearchFolders();
}

export async function refreshExternalSearchIndexes(folderId?: string) {
  const folders = loadExternalSearchFolders().filter((folder) => !folderId || folder.id === folderId);
  const db = openExternalSearchCacheDatabase();
  for (const folder of folders) {
    updateExternalSearchFolderIndexState({
      documentCount: folder.document_count,
      folderId: folder.id,
      indexedAt: folder.indexed_at,
      lastError: null,
      status: 'indexing'
    });
    try {
      const result = await syncExternalSearchFolder(db, folder);
      updateExternalSearchFolderIndexState({
        documentCount: result.documentCount,
        folderId: folder.id,
        indexedAt: result.indexedAt,
        lastError: null,
        status: 'ready'
      });
    } catch (error) {
      updateExternalSearchFolderIndexState({
        documentCount: 0,
        folderId: folder.id,
        indexedAt: null,
        lastError: error instanceof Error ? error.message : 'Unknown indexing error',
        status: 'error'
      });
    }
  }
  return loadExternalSearchFolders();
}

export function searchExternalDocuments(query: string) {
  const db = openExternalSearchCacheDatabase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const rows =
    normalizedQuery.length <= 2
      ? db
          .prepare(
            `SELECT
              absolute_path,
              file_name,
              folder_id,
              folder_path,
              relative_path,
              content AS text,
              modified_at,
              1000 AS rank
             FROM external_search_documents
             WHERE is_present = 1
               AND (instr(lower(file_name), ?) > 0
                OR instr(lower(relative_path), ?) > 0
                OR instr(lower(content), ?) > 0)
             ORDER BY modified_ms DESC
             LIMIT 20`
          )
          .all(normalizedQuery, normalizedQuery, normalizedQuery) as ExternalSearchRow[]
      : db
          .prepare(
            `SELECT
              absolute_path,
              file_name,
              folder_id,
              folder_path,
              relative_path,
              content AS text,
              modified_at,
              bm25(external_search_fts, 8.0, 5.0, 3.0, 1.0) AS rank
             FROM external_search_fts
             WHERE external_search_fts MATCH ?
             ORDER BY rank ASC, modified_at DESC
             LIMIT 20`
          )
          .all(normalizedQuery) as ExternalSearchRow[];
  return rows.map((row) => toExternalResult(row, normalizedQuery));
}

export function loadExternalSearchBrowseEntries(folderId: string): NativeExternalSearchBrowseEntry[] {
  return openExternalSearchCacheDatabase()
    .prepare(
      `SELECT absolute_path, extension, file_name, folder_id, folder_path, modified_at, relative_path
       FROM external_search_documents
       WHERE folder_id = ? AND is_present = 1
       ORDER BY relative_path COLLATE NOCASE ASC`
    )
    .all(folderId) as NativeExternalSearchBrowseEntry[];
}

export function loadExternalSearchPreview(absolutePath: string): NativeExternalSearchPreview | null {
  const row = openExternalSearchCacheDatabase()
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
  if (!row) {
    return null;
  }
  const folder = loadExternalSearchFolders().find((item) => item.id === row.folder_id) ?? null;
  const previewContent = resolveExternalPreviewSourceContent(row.content, row.absolute_path);
  return {
    ...row,
    content: row.extension === 'md' ? rewriteExternalPreviewContent(previewContent, row.absolute_path, folder) : previewContent
  };
}

export function pruneExternalSearchCache(validFolderIds: string[]) {
  const db = openExternalSearchCacheDatabase();
  const placeholders = validFolderIds.map(() => '?').join(', ');
  const deleteDocumentsSql = placeholders
    ? `DELETE FROM external_search_documents WHERE folder_id NOT IN (${placeholders})`
    : 'DELETE FROM external_search_documents';
  const deleteFtsSql = placeholders
    ? `DELETE FROM external_search_fts WHERE folder_id NOT IN (${placeholders})`
    : 'DELETE FROM external_search_fts';
  db.transaction(() => {
    db.prepare(deleteDocumentsSql).run(...validFolderIds);
    db.prepare(deleteFtsSql).run(...validFolderIds);
  })();
}

export { closeExternalSearchCacheDatabase };

import {
  markExternalDocumentsMissing,
  replaceExternalDocumentsForFolder,
  upsertExternalDocuments
} from './externalDocuments.js';
import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import {
  applyFolderDocumentChanges,
  loadScannedDocument,
  replaceFolderDocuments,
  scanFolder,
  scanFolderEntries,
  type ScannedDocument,
  type ScannedDocumentEntry
} from './externalSearchCacheSupport.js';
import { loadExternalSearchFolders, updateExternalSearchFolderIndexState } from './externalSearchFolders.js';

type SqliteDatabase = import('better-sqlite3').Database;
interface CachedFolderDocumentRow { absolute_path: string; is_present: number; modified_ms: number; relative_path: string; size_bytes: number }

function readCachedFolderDocuments(db: SqliteDatabase, folderId: string) {
  return db
    .prepare(
      `SELECT absolute_path, modified_ms, relative_path, size_bytes, is_present
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
  const deletedRows = existingRows.filter((row) => !seenAbsolutePaths.has(row.absolute_path));
  const deletedAbsolutePaths = deletedRows.map((row) => row.absolute_path);
  const documentsToUpsert: ScannedDocument[] = [];
  for (const entry of entriesToUpsert) {
    documentsToUpsert.push(await loadScannedDocument(entry));
  }
  const indexedAt = applyFolderDocumentChanges({
    db,
    deletedAbsolutePaths,
    documentsToUpsert,
    folder
  });
  upsertExternalDocuments(folder, documentsToUpsert, indexedAt);
  markExternalDocumentsMissing(
    deletedRows.map((row) => ({ relativePath: row.relative_path })),
    folder.id,
    indexedAt
  );
  return {
    documentCount: scannedEntries.length,
    indexedAt
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
      replaceExternalDocumentsForFolder(folder, documents, indexedAt);
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

export {
  loadExternalSearchBrowseEntries,
  loadExternalSearchPreview,
  searchExternalDocuments
} from './externalSearchLibraryAccess.js';

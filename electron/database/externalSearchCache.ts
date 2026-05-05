import { createRequire } from 'node:module';
import path from 'node:path';

import type { NativeExternalSearchPreview } from '../../lib/platform/nativeStorageContract.js';

import { resolveDatabasePath } from './connection.js';
import { replaceFolderDocuments, scanFolder, type ExternalSearchRow, type ScannedDocument, toExternalResult } from './externalSearchCacheSupport.js';
import { loadExternalSearchFolders, updateExternalSearchFolderIndexState } from './externalSearchFolders.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

type SqliteDatabase = import('better-sqlite3').Database;

let cachedCacheDb: SqliteDatabase | null = null;

function resolveCacheDbPath() {
  return path.join(path.dirname(resolveDatabasePath()), 'external-search-cache.db');
}

function openCacheDb() {
  if (cachedCacheDb) {
    return cachedCacheDb;
  }
  const dbPath = resolveCacheDbPath();
  cachedCacheDb = new BetterSqlite3(dbPath);
  cachedCacheDb.pragma('journal_mode = WAL');
  cachedCacheDb.exec(`CREATE TABLE IF NOT EXISTS external_search_documents (
    absolute_path TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    extension TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    modified_at TEXT NOT NULL,
    modified_ms INTEGER NOT NULL,
    indexed_at TEXT NOT NULL,
    content TEXT NOT NULL
  )`);
  cachedCacheDb.exec(`CREATE INDEX IF NOT EXISTS idx_external_search_documents_folder_id
    ON external_search_documents (folder_id)`);
  cachedCacheDb.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS external_search_fts USING fts5(
    title,
    file_name,
    relative_path,
    content,
    absolute_path UNINDEXED,
    folder_id UNINDEXED,
    folder_path UNINDEXED,
    modified_at UNINDEXED,
    tokenize = 'trigram'
  )`);
  return cachedCacheDb;
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
      const indexedAt = replaceFolderDocuments(openCacheDb(), folder, documents);
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

export function searchExternalDocuments(query: string) {
  const db = openCacheDb();
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
             WHERE instr(lower(file_name), ?) > 0
                OR instr(lower(relative_path), ?) > 0
                OR instr(lower(content), ?) > 0
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

export function loadExternalSearchPreview(absolutePath: string): NativeExternalSearchPreview | null {
  const row = openCacheDb()
    .prepare(
      `SELECT absolute_path, folder_id, folder_path, relative_path, file_name, extension, content
       FROM external_search_documents
       WHERE absolute_path = ?`
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
  return row ?? null;
}

export function pruneExternalSearchCache(validFolderIds: string[]) {
  const db = openCacheDb();
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

import path from 'node:path';

import {
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH
} from './externalOpenedDocumentConstants.js';
import { writeOpenedDocumentFts } from './externalOpenedDocumentFts.js';
import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';

type SqliteDatabase = import('better-sqlite3').Database;

interface ExistingSearchDocumentRow {
  file_name: string;
  folder_id: string;
  folder_path: string;
  relative_path: string;
}

interface LocalDocumentSearchIndexArgs {
  absolutePath: string;
  content: string;
  fileSize: number;
  lastOpenedAt: string;
  modifiedAt: string;
  modifiedMs: number;
}

function toExtension(filePath: string): 'md' | 'txt' {
  return path.extname(filePath).toLowerCase() === '.txt' ? 'txt' : 'md';
}

function readExistingSearchDocument(db: SqliteDatabase, absolutePath: string) {
  return db
    .prepare(
      `SELECT file_name, folder_id, folder_path, relative_path
       FROM external_search_documents
       WHERE absolute_path = ?`
    )
    .get(absolutePath) as ExistingSearchDocumentRow | undefined;
}

export function upsertLocalDocumentSearchIndex(args: LocalDocumentSearchIndexArgs) {
  const db = openExternalSearchCacheDatabase();
  const existing = readExistingSearchDocument(db, args.absolutePath);
  const fileName = existing?.file_name ?? path.basename(args.absolutePath);
  const folderId = existing?.folder_id ?? OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID;
  const folderPath = existing?.folder_path ?? OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH;
  const relativePath = existing?.relative_path ?? args.absolutePath;
  const indexedAt = new Date().toISOString();

  db.prepare(`INSERT INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes,
    modified_at, modified_ms, indexed_at, is_present, last_opened_at, opened_expires_at, missing_at, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?)
  ON CONFLICT(absolute_path) DO UPDATE SET
    file_name = excluded.file_name,
    extension = excluded.extension,
    size_bytes = excluded.size_bytes,
    modified_at = excluded.modified_at,
    modified_ms = excluded.modified_ms,
    indexed_at = excluded.indexed_at,
    is_present = 1,
    last_opened_at = excluded.last_opened_at,
    missing_at = NULL,
    content = excluded.content`).run(
    args.absolutePath,
    folderId,
    folderPath,
    relativePath,
    fileName,
    toExtension(args.absolutePath),
    args.fileSize,
    args.modifiedAt,
    Math.round(args.modifiedMs),
    indexedAt,
    args.lastOpenedAt,
    args.content
  );

  writeOpenedDocumentFts(db, {
    absolutePath: args.absolutePath,
    content: args.content,
    fileName,
    folderId,
    folderPath,
    modifiedAt: args.modifiedAt,
    relativePath
  });
}

export function markLocalDocumentSearchIndexMissing(absolutePath: string, missingAt: string) {
  const db = openExternalSearchCacheDatabase();
  db.prepare(`UPDATE external_search_documents
    SET is_present = 0, missing_at = ?, content = ''
    WHERE absolute_path = ?`).run(missingAt, absolutePath);
  db.prepare('DELETE FROM external_search_fts WHERE absolute_path = ?').run(absolutePath);
}

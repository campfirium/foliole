import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveImportedNodeTitle } from '../../lib/core/import/importedNodeTitle.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import type {
  NativeExternalSearchBrowseEntry,
  NativeExternalSearchFolder
} from '../../lib/platform/nativeStorageContract.js';

import {
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
  OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH
} from './externalOpenedDocumentConstants.js';
import { writeOpenedDocumentFts } from './externalOpenedDocumentFts.js';
import { openExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';

const OPENED_EXTERNAL_DOCUMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SqliteDatabase = import('better-sqlite3').Database;

interface OpenedExternalDocumentRow {
  absolute_path: string;
  content: string;
  extension: 'md' | 'txt';
  file_name: string;
  folder_id: string;
  folder_path: string;
  is_present: number;
  last_opened_at: string | null;
  modified_at: string;
  relative_path: string;
}

function readExternalSearchDocumentRow(db: SqliteDatabase, absolutePath: string) {
  return db
    .prepare(
      `SELECT absolute_path, content, extension, file_name, folder_id, folder_path, is_present,
        last_opened_at, modified_at, relative_path
       FROM external_search_documents
       WHERE absolute_path = ?`
    )
    .get(absolutePath) as OpenedExternalDocumentRow | undefined;
}

function resolveOpenedExpiresAt(lastOpenedAt: string) {
  return new Date(new Date(lastOpenedAt).getTime() + OPENED_EXTERNAL_DOCUMENT_TTL_MS).toISOString();
}

function isSupportedOpenedDocument(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.md' || extension === '.markdown' || extension === '.txt';
}

function toExtension(filePath: string): 'md' | 'txt' {
  return path.extname(filePath).toLowerCase() === '.txt' ? 'txt' : 'md';
}

function pruneExpiredOpenedDocuments(db: SqliteDatabase, now = new Date()) {
  const nowIso = now.toISOString();
  db.transaction(() => {
    db.prepare(`DELETE FROM external_search_fts WHERE folder_id = ? AND absolute_path IN (
      SELECT absolute_path FROM external_search_documents
      WHERE folder_id = ? AND opened_expires_at <= ?
    )`).run(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID, OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID, nowIso);
    db.prepare('DELETE FROM external_search_documents WHERE folder_id = ? AND opened_expires_at <= ?')
      .run(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID, nowIso);
  })();
}

function toBrowseEntry(row: OpenedExternalDocumentRow): NativeExternalSearchBrowseEntry {
  const title = resolveImportedNodeTitle({
    content: row.content,
    sourceName: row.file_name,
    titleStrategy: 'heading'
  });
  return {
    absolute_path: row.absolute_path,
    extension: row.extension,
    file_name: row.file_name,
    folder_id: row.folder_id,
    folder_path: row.folder_path,
    imported_node_id: null,
    is_present: row.is_present === 1,
    last_opened_at: row.last_opened_at,
    modified_at: row.modified_at,
    opening_text: resolveNodeOpeningText(row.content, title),
    reference: { absolute_path: row.absolute_path, kind: 'local_path' },
    relative_path: row.relative_path,
    title
  };
}

export function loadOpenedExternalSearchFolder(): NativeExternalSearchFolder | null {
  const db = openExternalSearchCacheDatabase();
  pruneExpiredOpenedDocuments(db);
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM external_search_documents WHERE folder_id = ?')
    .get(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID) as { count: number };
  if (count.count === 0) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    created_at: now,
    document_count: count.count,
    excluded_dirs: [],
    folder_path: OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH,
    id: OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
    indexed_at: now,
    last_error: null,
    status: 'ready',
    updated_at: now
  };
}

export function loadOpenedExternalSearchBrowseEntries() {
  const db = openExternalSearchCacheDatabase();
  pruneExpiredOpenedDocuments(db);
  const rows = db
    .prepare(
      `SELECT absolute_path, content, extension, file_name, folder_id, folder_path, is_present,
        last_opened_at, modified_at, relative_path
       FROM external_search_documents
       WHERE folder_id = ?
       ORDER BY last_opened_at DESC, file_name COLLATE NOCASE ASC`
    )
    .all(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID) as OpenedExternalDocumentRow[];
  return rows.map(toBrowseEntry);
}

export async function refreshOpenedExternalDocumentRows() {
  const db = openExternalSearchCacheDatabase();
  pruneExpiredOpenedDocuments(db);
  const rows = db
    .prepare('SELECT absolute_path FROM external_search_documents WHERE folder_id = ?')
    .all(OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID) as Array<{ absolute_path: string }>;
  for (const row of rows) {
    try {
      const stat = await fs.stat(row.absolute_path);
      const content = await fs.readFile(row.absolute_path, 'utf8');
      upsertOpenedExternalDocument(db, row.absolute_path, content, stat, null);
    } catch {
      const missingAt = new Date().toISOString();
      db.prepare('UPDATE external_search_documents SET is_present = 0, missing_at = ? WHERE absolute_path = ?')
        .run(missingAt, row.absolute_path);
      db.prepare('DELETE FROM external_search_fts WHERE absolute_path = ?').run(row.absolute_path);
    }
  }
}

export async function recordOpenedExternalDocument(filePath: string) {
  const absolutePath = path.resolve(filePath);
  if (!isSupportedOpenedDocument(absolutePath)) {
    return null;
  }
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    return null;
  }
  const content = await fs.readFile(absolutePath, 'utf8');
  const db = openExternalSearchCacheDatabase();
  pruneExpiredOpenedDocuments(db);
  const openedAt = new Date().toISOString();
  const existing = readExternalSearchDocumentRow(db, absolutePath);
  if (existing && existing.folder_id !== OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID) {
    const modifiedAt = new Date(stat.mtimeMs).toISOString();
    db.prepare(`UPDATE external_search_documents
      SET content = ?, is_present = 1, last_opened_at = ?, missing_at = NULL,
        modified_at = ?, modified_ms = ?, size_bytes = ?
      WHERE absolute_path = ?`)
      .run(content, openedAt, modifiedAt, Math.round(stat.mtimeMs), stat.size, absolutePath);
    writeOpenedDocumentFts(db, {
      absolutePath,
      content,
      fileName: existing.file_name,
      folderId: existing.folder_id,
      folderPath: existing.folder_path,
      modifiedAt,
      relativePath: existing.relative_path
    });
    return toBrowseEntry({ ...existing, content, is_present: 1, last_opened_at: openedAt, modified_at: modifiedAt });
  }
  upsertOpenedExternalDocument(db, absolutePath, content, stat, openedAt);
  return loadOpenedExternalSearchBrowseEntries().find((entry) => entry.absolute_path === absolutePath) ?? null;
}

function upsertOpenedExternalDocument(
  db: SqliteDatabase,
  absolutePath: string,
  content: string,
  stat: { mtimeMs: number; size: number },
  openedAt: string | null
) {
  const existing = db
    .prepare('SELECT last_opened_at FROM external_search_documents WHERE absolute_path = ?')
    .get(absolutePath) as { last_opened_at: string | null } | undefined;
  const lastOpenedAt = openedAt ?? existing?.last_opened_at ?? new Date().toISOString();
  const modifiedAt = new Date(stat.mtimeMs).toISOString();
  const fileName = path.basename(absolutePath);
  db.prepare(`INSERT OR REPLACE INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes,
    modified_at, modified_ms, indexed_at, is_present, last_opened_at, opened_expires_at, missing_at, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, ?)`).run(
    absolutePath,
    OPENED_EXTERNAL_DOCUMENTS_FOLDER_ID,
    OPENED_EXTERNAL_DOCUMENTS_FOLDER_PATH,
    absolutePath,
    fileName,
    toExtension(absolutePath),
    stat.size,
    modifiedAt,
    Math.round(stat.mtimeMs),
    new Date().toISOString(),
    lastOpenedAt,
    resolveOpenedExpiresAt(lastOpenedAt),
    content
  );
  writeOpenedDocumentFts(db, { absolutePath, content, fileName, modifiedAt });
}

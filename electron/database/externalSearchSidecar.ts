import path from 'node:path';

import {
  FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY,
  resolveFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy,
  type FullTextSearchTokenizer
} from '../../lib/core/database/fullTextSearchIndexStrategy.js';

const EXTERNAL_SEARCH_SIDECAR_SCHEMA_VERSION = 1;

type SqliteDatabase = import('better-sqlite3').Database;

interface MetadataRow {
  value_json?: unknown;
}

interface ExternalSearchProjectionRow {
  absolute_path: string;
  content: string;
  file_name: string;
  folder_id: string;
  folder_path: string;
  modified_at: string;
  relative_path: string;
}

export interface ExternalSearchSidecarRebuildStatus {
  error?: string;
  status: 'failed' | 'ready' | 'rebuilding';
  strategy: FullTextSearchIndexStrategy;
  tokenizer: FullTextSearchTokenizer;
}

interface RebuildExternalSearchSidecarOptions {
  documentChunkSize?: number;
  progress?: (progress: { completed?: number; message?: string; total?: number; unit?: string }) => void;
  strategy: FullTextSearchIndexStrategy;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readMetadata(db: SqliteDatabase, key: string) {
  const row = db.prepare('SELECT value_json FROM external_search_metadata WHERE key = ?').get(key) as MetadataRow | undefined;
  return readJsonObject(row?.value_json);
}

function writeMetadata(db: SqliteDatabase, key: string, value: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO external_search_metadata (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

function tryWriteMetadata(db: SqliteDatabase, key: string, value: Record<string, unknown>) {
  try {
    writeMetadata(db, key, value);
  } catch {
    // Metadata should not make a derived-index failure harder to recover.
  }
}

export function createExternalSearchMetadataTable(db: SqliteDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS external_search_metadata (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

function hasExternalSearchFtsTable(db: SqliteDatabase) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'external_search_fts'")
    .get() as { name: string } | undefined;
  return row?.name === 'external_search_fts';
}

function shouldRetryPreviousRebuild(db: SqliteDatabase) {
  const status = readMetadata(db, 'last_rebuild_status');
  return status?.status === 'failed' || status?.status === 'rebuilding';
}

function shouldRebuildExternalSearchFts(db: SqliteDatabase, tokenizer: FullTextSearchTokenizer) {
  const metadata = readMetadata(db, 'schema');
  return metadata?.schemaVersion !== EXTERNAL_SEARCH_SIDECAR_SCHEMA_VERSION ||
    metadata?.tokenizer !== tokenizer ||
    !hasExternalSearchFtsTable(db);
}

function createExternalSearchFtsTable(db: SqliteDatabase, tokenizer: FullTextSearchTokenizer) {
  db.exec(`CREATE VIRTUAL TABLE external_search_fts USING fts5(
    title,
    file_name,
    relative_path,
    content,
    absolute_path UNINDEXED,
    folder_id UNINDEXED,
    folder_path UNINDEXED,
    modified_at UNINDEXED,
    tokenize = '${tokenizer}'
  )`);
}

function readPresentProjectionRows(db: SqliteDatabase) {
  return db
    .prepare(
      `SELECT absolute_path, file_name, folder_id, folder_path, relative_path, content, modified_at
       FROM external_search_documents
       WHERE is_present = 1
       ORDER BY absolute_path ASC`
    )
    .all() as ExternalSearchProjectionRow[];
}

function backfillExternalSearchFts(db: SqliteDatabase, options: RebuildExternalSearchSidecarOptions) {
  const rows = readPresentProjectionRows(db);
  const insertFts = db.prepare(`INSERT INTO external_search_fts (
    title, file_name, relative_path, content, absolute_path, folder_id, folder_path, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const chunkSize = options.documentChunkSize ?? 100;
  let completed = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    db.transaction(() => {
      chunk.forEach((row) => {
        insertFts.run(
          path.basename(row.file_name, path.extname(row.file_name)).trim() || row.file_name,
          row.file_name,
          row.relative_path,
          row.content,
          row.absolute_path,
          row.folder_id,
          row.folder_path,
          row.modified_at
        );
      });
    })();
    completed += chunk.length;
    options.progress?.({ completed, message: 'rebuilt external search fts chunk', total: rows.length, unit: 'document' });
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function markExternalSearchSidecarRebuilding(db: SqliteDatabase, strategy: FullTextSearchIndexStrategy) {
  const resolution = resolveFullTextSearchIndexStrategy({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: strategy });
  const status = {
    status: 'rebuilding',
    strategy: resolution.strategy,
    tokenizer: resolution.tokenizer
  } as const;
  writeMetadata(db, 'last_rebuild_status', status);
  return status;
}

export function rebuildExternalSearchSidecar(
  db: SqliteDatabase,
  options: RebuildExternalSearchSidecarOptions
): ExternalSearchSidecarRebuildStatus {
  const resolution = resolveFullTextSearchIndexStrategy({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: options.strategy });
  markExternalSearchSidecarRebuilding(db, resolution.strategy);
  try {
    db.exec('DROP TABLE IF EXISTS external_search_fts');
    createExternalSearchFtsTable(db, resolution.tokenizer);
    backfillExternalSearchFts(db, { ...options, strategy: resolution.strategy });
    writeMetadata(db, 'schema', {
      schemaVersion: EXTERNAL_SEARCH_SIDECAR_SCHEMA_VERSION,
      strategy: resolution.strategy,
      tokenizer: resolution.tokenizer
    });
    const readyStatus = {
      status: 'ready',
      strategy: resolution.strategy,
      tokenizer: resolution.tokenizer
    } as const;
    writeMetadata(db, 'last_rebuild_status', readyStatus);
    return readyStatus;
  } catch (error) {
    const failedStatus = {
      error: toErrorMessage(error),
      status: 'failed',
      strategy: resolution.strategy,
      tokenizer: resolution.tokenizer
    } as const;
    tryWriteMetadata(db, 'last_rebuild_status', failedStatus);
    return failedStatus;
  }
}

export function shouldInitializeExternalSearchSidecar(db: SqliteDatabase, strategy: FullTextSearchIndexStrategy) {
  const resolution = resolveFullTextSearchIndexStrategy({ [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: strategy });
  return shouldRebuildExternalSearchFts(db, resolution.tokenizer) || shouldRetryPreviousRebuild(db);
}

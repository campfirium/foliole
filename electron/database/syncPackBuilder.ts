import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { DatabaseRow } from '../../lib/core/database/driver.js';

import { openDatabaseConnection } from './connection.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

interface BuildDesktopSyncPackInput {
  outputPath: string;
  packId: string;
  fromStateSeq: number;
  toStateSeq?: number;
}

interface SyncStatePackRow extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  state_seq: number;
  updated_at: string;
}

interface NodePackRow extends DatabaseRow {
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  hide_title_heading: number;
  id: string;
  is_title_manual: number;
  kind: string;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

interface ExternalDocumentPackRow extends DatabaseRow {
  body_blob_hash: string | null;
  content: string;
  content_hash: string;
  created_at: string;
  document_id: string;
  extension: string;
  file_name: string;
  folder_id: string;
  indexed_at: string;
  is_present: number;
  missing_at: string | null;
  opening_text: string | null;
  relative_path: string;
  source_modified_at: string;
  source_modified_ms: number;
  source_size_bytes: number;
  title: string | null;
  updated_at: string;
}

interface ContentBlobPackRow extends DatabaseRow {
  availability: string;
  cached_at: string | null;
  compression: string;
  created_at: string;
  hash: string;
  kind: string;
  last_verified_at: string | null;
  mime_type: string | null;
  original_sha256: string;
  original_size_bytes: number;
  source_device_id: string | null;
  storage_key: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

const PACK_OBJECT_TYPES = new Set(['external_document', 'node']);

function normalizeSeq(value: number) {
  return Math.max(0, Math.trunc(value));
}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function listChangedStateRows(fromStateSeq: number, toStateSeq: number) {
  return openDatabaseConnection().driver.queryAll<SyncStatePackRow>(
    `SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at
     FROM sync_object_state
     WHERE state_seq > ? AND state_seq <= ?
     ORDER BY state_seq ASC`,
    [fromStateSeq, toStateSeq]
  );
}

function copyRows<T extends DatabaseRow>(args: {
  columns: string[];
  db: import('better-sqlite3').Database;
  rows: T[];
  table: string;
  values?: (row: T) => unknown[];
}) {
  if (args.rows.length === 0) return;
  const sql = `INSERT INTO ${args.table} (${args.columns.join(', ')}) VALUES (${placeholders(args.columns)})`;
  const statement = args.db.prepare(sql);
  for (const row of args.rows) {
    statement.run(...(args.values ? args.values(row) : args.columns.map((column) => row[column])));
  }
}

function queryRowsByIds<T extends DatabaseRow>(sql: string, ids: string[]) {
  if (ids.length === 0) return [];
  return openDatabaseConnection().driver.queryAll<T>(sql.replace('__IDS__', placeholders(ids)), ids);
}

function collectBodyBlobHashes(nodes: NodePackRow[], documents: ExternalDocumentPackRow[]) {
  return [...new Set([
    ...nodes.map((row) => row.body_blob_hash),
    ...documents.map((row) => row.body_blob_hash)
  ].filter((hash): hash is string => Boolean(hash)))];
}

function loadMaxStateSeq() {
  return openDatabaseConnection().driver.queryOne<{ value: number }>(
    'SELECT COALESCE(MAX(state_seq), 0) AS value FROM sync_object_state'
  )?.value ?? 0;
}

function loadPackRows(fromStateSeq: number, toStateSeq: number) {
  const stateRows = listChangedStateRows(fromStateSeq, toStateSeq)
    .filter((row) => PACK_OBJECT_TYPES.has(row.object_type));
  const nodeIds = stateRows.filter((row) => row.object_type === 'node').map((row) => row.object_id);
  const externalDocumentIds = stateRows.filter((row) => row.object_type === 'external_document').map((row) => row.object_id);
  const nodes = queryRowsByIds<NodePackRow>(
    `SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
       content, created_at, updated_at, deleted_at
     FROM nodes WHERE id IN (__IDS__)`,
    nodeIds
  );
  const externalDocuments = queryRowsByIds<ExternalDocumentPackRow>(
    `SELECT document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
       source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash,
       content, indexed_at, is_present, missing_at, created_at, updated_at
     FROM external_documents WHERE document_id IN (__IDS__)`,
    externalDocumentIds
  );
  return {
    contentBlobs: queryRowsByIds<ContentBlobPackRow>(
      `SELECT hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
         original_sha256, stored_sha256, availability, source_device_id, created_at, cached_at, last_verified_at
       FROM content_blobs WHERE hash IN (__IDS__)`,
      collectBodyBlobHashes(nodes, externalDocuments)
    ),
    externalDocuments,
    nodes,
    stateRows
  };
}

function writePackManifest(db: import('better-sqlite3').Database, input: BuildDesktopSyncPackInput, fromStateSeq: number, toStateSeq: number) {
  db.prepare('INSERT INTO pack_manifest (key, value) VALUES (?, ?)').run('manifest_json', JSON.stringify({
    pack_id: input.packId,
    from_state_seq: fromStateSeq,
    to_state_seq: toStateSeq,
    table_names: ['sync_object_state', 'nodes', 'external_documents', 'content_blobs']
  }));
}

function writePackRows(db: import('better-sqlite3').Database, rows: ReturnType<typeof loadPackRows>) {
  copyRows({
    db,
    table: 'sync_object_state',
    columns: ['object_type', 'object_id', 'state_seq', 'content_hash', 'updated_at', 'deleted_at'],
    rows: rows.stateRows
  });
  copyRows({
    db,
    table: 'nodes',
    columns: ['id', 'parent_id', 'kind', 'title', 'is_title_manual', 'hide_title_heading',
      'body_blob_hash', 'content', 'created_at', 'updated_at', 'deleted_at'],
    rows: rows.nodes,
    values: (row) => [row.id, row.parent_id, row.kind, row.title, row.is_title_manual,
      row.hide_title_heading, row.body_blob_hash, '', row.created_at, row.updated_at, row.deleted_at]
  });
  copyRows({
    db,
    table: 'external_documents',
    columns: ['document_id', 'folder_id', 'relative_path', 'file_name', 'extension', 'source_size_bytes',
      'source_modified_at', 'source_modified_ms', 'content_hash', 'title', 'opening_text', 'body_blob_hash',
      'content', 'indexed_at', 'is_present', 'missing_at', 'created_at', 'updated_at'],
    rows: rows.externalDocuments,
    values: (row) => [row.document_id, row.folder_id, row.relative_path, row.file_name, row.extension,
      row.source_size_bytes, row.source_modified_at, row.source_modified_ms, row.content_hash, row.title,
      row.opening_text, row.body_blob_hash, '', row.indexed_at, row.is_present, row.missing_at,
      row.created_at, row.updated_at]
  });
  copyRows({
    db,
    table: 'content_blobs',
    columns: ['hash', 'storage_key', 'kind', 'mime_type', 'compression', 'original_size_bytes',
      'stored_size_bytes', 'original_sha256', 'stored_sha256', 'availability', 'source_device_id',
      'created_at', 'cached_at', 'last_verified_at'],
    rows: rows.contentBlobs
  });
}

export async function buildDesktopSyncPack(input: BuildDesktopSyncPackInput) {
  const fromStateSeq = normalizeSeq(input.fromStateSeq);
  const toStateSeq = normalizeSeq(input.toStateSeq ?? loadMaxStateSeq());
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.rm(input.outputPath, { force: true });

  const packDb = new BetterSqlite3(input.outputPath);
  try {
    for (const statement of PACK_SCHEMA) {
      packDb.exec(statement);
    }
    const rows = loadPackRows(fromStateSeq, toStateSeq);
    const packToStateSeq = rows.stateRows.at(-1)?.state_seq ?? fromStateSeq;

    const writePack = packDb.transaction(() => {
      writePackManifest(packDb, input, fromStateSeq, packToStateSeq);
      writePackRows(packDb, rows);
    });
    writePack();
    return {
      outputPath: input.outputPath,
      packId: input.packId,
      fromStateSeq,
      toStateSeq: packToStateSeq,
      objectCount: rows.stateRows.length,
      bodyBlobCount: rows.contentBlobs.length
    };
  } finally {
    packDb.close();
  }
}

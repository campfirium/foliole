import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';
import {
  isSyncPackObjectType,
  isSyncPackPayloadObjectType,
  isSyncPackStateObjectType,
  SYNC_PACK_OBJECT_TYPE_TABLES,
  type SyncPackObjectType
} from './syncPackManifest.js';
import { loadSyncObjects } from './syncObjects.js';

interface RawSyncStatePackRow extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: string;
  state_seq: number;
  updated_at: string;
}

export interface SyncStatePackRow extends RawSyncStatePackRow {
  object_type: string;
}

export type SyncObjectPackRow = NativeSyncObjectRecord;

export interface NodePackRow extends DatabaseRow {
  body_blob_hash: string | null;
  content: string;
  created_at: string;
  deleted_at: string | null;
  hide_title_heading: number;
  id: string;
  is_title_manual: number;
  kind: string;
  opening_text: string | null;
  parent_id: string | null;
  title: string;
  updated_at: string;
}

export interface ExternalDocumentPackRow extends DatabaseRow {
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

export interface ContentBlobPackRow extends DatabaseRow {
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

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function listChangedStateRows(fromStateSeq: number, toStateSeq: number) {
  return openDatabaseConnection().driver.queryAll<RawSyncStatePackRow>(
    `SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at
     FROM sync_object_state
     WHERE state_seq > ? AND state_seq <= ?
     ORDER BY state_seq ASC`,
    [fromStateSeq, toStateSeq]
  );
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

function idsForObjectTable(rows: SyncStatePackRow[], table: 'external_documents' | 'nodes') {
  return rows
    .filter((row): row is SyncStatePackRow & { object_type: SyncPackObjectType } => isSyncPackObjectType(row.object_type))
    .filter((row) => SYNC_PACK_OBJECT_TYPE_TABLES[row.object_type] === table)
    .map((row) => row.object_id);
}

function loadPayloadObjects(rows: SyncStatePackRow[]): SyncObjectPackRow[] {
  const payloadRows = rows.filter((row) => isSyncPackPayloadObjectType(row.object_type));
  if (payloadRows.length === 0) return [];
  return loadSyncObjects(
    payloadRows.map((row) => row.object_id),
    [...new Set(payloadRows.map((row) => row.object_type))]
  );
}

function isSyncStatePackRow(row: RawSyncStatePackRow): row is SyncStatePackRow {
  return isSyncPackStateObjectType(row.object_type);
}

export function loadMaxStateSeq() {
  return openDatabaseConnection().driver.queryOne<{ value: number }>(
    'SELECT COALESCE(MAX(state_seq), 0) AS value FROM sync_object_state'
  )?.value ?? 0;
}

export function loadPackRows(fromStateSeq: number, toStateSeq: number) {
  const stateRows = listChangedStateRows(fromStateSeq, toStateSeq).filter(isSyncStatePackRow);
  const nodeIds = idsForObjectTable(stateRows, 'nodes');
  const externalDocumentIds = idsForObjectTable(stateRows, 'external_documents');
  const nodes = queryRowsByIds<NodePackRow>(
    `SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash,
       opening_text, content, created_at, updated_at, deleted_at
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
    stateRows,
    syncObjects: loadPayloadObjects(stateRows)
  };
}

export type LoadedSyncPackRows = ReturnType<typeof loadPackRows>;

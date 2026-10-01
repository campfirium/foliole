import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import {
  isSyncPackObjectType,
  isSyncPackPayloadObjectType,
  isSyncPackStateObjectType,
  SYNC_PACK_OBJECT_TYPE_TABLES,
  type SyncPackObjectType
} from '../../lib/core/sync/syncPackManifest.js';
import {
  SYNC_PACK_NODE_COLUMNS,
  type SyncPackNodeRow
} from '../../lib/core/sync/syncPackNodeFields.js';
import type { NativeSyncObjectRecord, NativeSyncReviewLogRecord } from '../../lib/platform/nativeSyncContract.js';

import { hasSyncObjectPayloadFromDriver, loadSyncObjectsFromDriver } from './syncObjectsFromDriver.js';
import { learningNodeIds, loadNodePreludeStateRows, mergeStateRows } from './syncPackLearningRows.js';

interface RawSyncStatePackRow extends DatabaseRow {
  content_hash: string;
  deleted_at: string | null;
  last_modified_by_host_name: string;
  object_id: string;
  object_type: string;
  state_seq: number;
  updated_at: string;
}

export interface SyncStatePackRow extends RawSyncStatePackRow {
  object_type: string;
}

export type SyncObjectPackRow = NativeSyncObjectRecord;

export type NodePackRow = SyncPackNodeRow;

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
  reference_json: string | null;
  reference_kind: string;
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
  source_host_name: string | null;
  storage_key: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

export interface ReviewLogPackRow extends DatabaseRow, NativeSyncReviewLogRecord {}

function placeholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

const SYNC_PACK_PRESENT_STATE_PREDICATE = `
     (object_type <> 'node' OR object_id NOT IN ('special-inbox', 'special-virtual-root'))
     AND (object_type <> 'node' OR deleted_at IS NOT NULL OR EXISTS (
       SELECT 1 FROM nodes WHERE nodes.id = sync_object_state.object_id
     ))
     AND (object_type NOT IN ('node_reading', 'node_review') OR deleted_at IS NOT NULL OR EXISTS (
       SELECT 1 FROM nodes WHERE nodes.id = sync_object_state.object_id
     ))
     AND (object_type <> 'node_reading' OR deleted_at IS NOT NULL OR EXISTS (
       SELECT 1 FROM node_reading reading JOIN nodes node ON node.id = reading.node_id
       WHERE reading.node_id = sync_object_state.object_id AND node.deleted_at IS NULL
     ))`;

function listChangedStateRows(driver: DatabaseDriver, fromStateSeq: number, toStateSeq: number) {
  return driver.queryAll<RawSyncStatePackRow>(
    `SELECT object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at
     FROM sync_object_state
     WHERE state_seq > ? AND state_seq <= ? AND ${SYNC_PACK_PRESENT_STATE_PREDICATE}
     ORDER BY state_seq ASC`,
    [fromStateSeq, toStateSeq]
  );
}

function queryRowsByIds<T extends DatabaseRow>(driver: DatabaseDriver, sql: string, ids: string[]) {
  if (ids.length === 0) return [];
  return driver.queryAll<T>(sql.replace('__IDS__', placeholders(ids)), ids);
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

function loadPayloadObjects(driver: DatabaseDriver, rows: SyncStatePackRow[]): SyncObjectPackRow[] {
  const payloadRows = rows.filter((row) => isSyncPackPayloadObjectType(row.object_type));
  if (payloadRows.length === 0) return [];
  const rowsByType = new Map<string, string[]>();
  for (const row of payloadRows) {
    rowsByType.set(row.object_type, [...(rowsByType.get(row.object_type) ?? []), row.object_id]);
  }
  return [...rowsByType.entries()].flatMap(([objectType, objectIds]) => loadSyncObjectsFromDriver(
    driver, objectIds, [objectType]
  )).filter((record) => record.deleted_at !== null || record.payload_json !== null);
}

function retainBackedStateRows(rows: SyncStatePackRow[], syncObjects: SyncObjectPackRow[]) {
  const payloadKeys = new Set(syncObjects.map(
    (record) => `${record.object_type}:${record.object_id}`
  ));
  return rows.filter((row) => !isSyncPackPayloadObjectType(row.object_type)
    || payloadKeys.has(`${row.object_type}:${row.object_id}`));
}

function loadReviewLogRows(driver: DatabaseDriver, rows: SyncStatePackRow[]): ReviewLogPackRow[] {
  const nodeIds = rows
    .filter((row) => row.object_type === 'node_review')
    .map((row) => row.object_id);
  return queryRowsByIds<ReviewLogPackRow>(driver,
    `SELECT
       id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     FROM review_log WHERE node_id IN (__IDS__)
     ORDER BY reviewed_at ASC, op_id ASC`,
    nodeIds
  );
}

function isSyncStatePackRow(row: RawSyncStatePackRow): row is SyncStatePackRow {
  return isSyncPackStateObjectType(row.object_type);
}

export function loadMaxStateSeq(driver: DatabaseDriver) {
  return driver.queryOne<{ value: number }>(
    'SELECT high_water AS value FROM sync_state_sequence WHERE singleton_id = 1'
  )?.value ?? 0;
}

export function loadPackRows(
  fromStateSeq: number,
  toStateSeq: number,
  driver: DatabaseDriver,
  stagedReviewNodeIds: readonly string[] = []
) {
  const listedStateRows = listChangedStateRows(driver, fromStateSeq, toStateSeq).filter(isSyncStatePackRow);
  const changedStateRows = retainBackedStateRows(listedStateRows, loadPayloadObjects(driver, listedStateRows));
  const changedNodeIds = idsForObjectTable(changedStateRows, 'nodes');
  const nodePreludeStateRows = mergeStateRows(changedStateRows, loadNodePreludeStateRows({
    isSyncStatePackRow,
    nodeIds: [...changedNodeIds, ...learningNodeIds(changedStateRows)],
    placeholders,
    query: (sql, params) => driver.queryAll<RawSyncStatePackRow>(sql, params)
  }));
  const nodeIds = [...new Set([
    ...idsForObjectTable(nodePreludeStateRows, 'nodes'),
    ...learningNodeIds(nodePreludeStateRows)
  ])];
  const nodes = queryRowsByIds<NodePackRow>(driver,
    `SELECT ${SYNC_PACK_NODE_COLUMNS.map((column) => column === 'content' ? "'' AS content" : column).join(', ')}
     FROM nodes WHERE id IN (__IDS__)`,
    nodeIds
  );
  const candidateStateRows = nodePreludeStateRows;
  const syncObjects = loadPayloadObjects(driver, candidateStateRows);
  const stateRows = retainBackedStateRows(candidateStateRows, syncObjects);
  const externalDocumentIds = idsForObjectTable(stateRows, 'external_documents');
  const externalDocuments = queryRowsByIds<ExternalDocumentPackRow>(driver,
    `SELECT document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
       source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash,
       '' AS content, reference_kind, reference_json, indexed_at, is_present, missing_at, created_at, updated_at
     FROM external_documents WHERE document_id IN (__IDS__)`,
    externalDocumentIds
  );
  return {
    consumedStateSeq: toStateSeq,
    contentBlobs: queryRowsByIds<ContentBlobPackRow>(driver,
      `SELECT hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
         original_sha256, stored_sha256, availability, source_host_name, created_at, cached_at, last_verified_at
       FROM content_blobs WHERE hash IN (__IDS__)`,
      collectBodyBlobHashes(nodes, externalDocuments)
    ),
    externalDocuments,
    nodes,
    reviewLog: loadReviewLogRows(driver, stateRows.filter((row) => !stagedReviewNodeIds.includes(row.object_id))),
    stateRows,
    syncObjects
  };
}

export type LoadedSyncPackRows = ReturnType<typeof loadPackRows>;

export function loadPresentSyncPackStateRows(driver: DatabaseDriver, fromStateSeq: number, toStateSeq: number) {
  const rows = listChangedStateRows(driver, fromStateSeq, toStateSeq).filter(isSyncStatePackRow);
  return rows.filter((row) => !isSyncPackPayloadObjectType(row.object_type) || row.deleted_at !== null ||
    hasSyncObjectPayloadFromDriver(driver, row.object_type, row.object_id));
}

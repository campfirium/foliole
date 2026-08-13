import {
  SYNC_PACK_LEGACY_OPTIONAL_NODE_COLUMNS,
  SYNC_PACK_NODE_COLUMNS,
  type SyncPackNodeColumn
} from './syncPackNodeFields.js';

export interface SyncPackApplyableRowsOptions {
  excludedNodeIds?: readonly string[] | undefined;
  incomingAlias?: string;
  objectType?: string;
  sourcePeerId?: string;
}

export interface SyncPackNodeApplyOptions extends SyncPackApplyableRowsOptions {
  incomingNodeColumns?: readonly string[];
}

const SYNC_PACK_NODE_UPDATE_COLUMNS = SYNC_PACK_NODE_COLUMNS.filter((column) => column !== 'id');
const SYNC_PACK_CONTENT_BLOB_UPDATE_COLUMNS = [
  'storage_key', 'kind', 'mime_type', 'compression', 'original_size_bytes', 'stored_size_bytes',
  'original_sha256', 'stored_sha256', 'availability', 'source_device_id', 'created_at',
  'cached_at', 'last_verified_at'
] as const;
const NODE_PROVENANCE_COLUMNS = [
  'import_source_fingerprint',
  'import_content_fingerprint'
] as const satisfies readonly SyncPackNodeColumn[];

function incomingAlias(options: { incomingAlias?: string }) {
  return options.incomingAlias ?? 'inc';
}

function typeFilter(objectType: string | undefined) {
  return objectType ? ` AND incoming.object_type = '${objectType.replaceAll("'", "''")}'` : '';
}

function excludedNodeFilter(options: SyncPackApplyableRowsOptions) {
  if (!options.excludedNodeIds?.length || (options.objectType && options.objectType !== 'node')) return '';
  const ids = options.excludedNodeIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(', ');
  const idFilter = `incoming.object_id NOT IN (${ids})`;
  return options.objectType === 'node'
    ? ` AND ${idFilter}`
    : ` AND (incoming.object_type <> 'node' OR ${idFilter})`;
}

function acceptedDeliveryFilter(options: SyncPackApplyableRowsOptions) {
  if (!options.sourcePeerId) return '0';
  const peerId = options.sourcePeerId.replaceAll("'", "''");
  return `EXISTS (SELECT 1 FROM main.sync_delivery_receipts receipt ` +
    `WHERE receipt.peer_id = '${peerId}' AND receipt.stream_name = 'state' ` +
    `AND receipt.object_type = incoming.object_type AND receipt.object_id = incoming.object_id ` +
    `AND receipt.payload_identity = current.content_hash AND receipt.status = 'accepted' ` +
    `AND receipt.remote_position IS NOT NULL ` +
    `AND incoming.state_seq >= CAST(receipt.remote_position AS INTEGER))`;
}

export function buildSyncPackApplyableRowsSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `(SELECT incoming.object_type, incoming.object_id, incoming.state_seq, incoming.content_hash, ` +
    `incoming.updated_at, incoming.deleted_at FROM ${alias}.sync_object_state incoming ` +
    `LEFT JOIN main.sync_object_state current ON current.object_type = incoming.object_type ` +
    `AND current.object_id = incoming.object_id WHERE ` +
    `(current.object_id IS NULL OR (current.updated_at <= incoming.updated_at ` +
    `AND (incoming.object_type IN ('node', 'view_state') OR current.sync_dirty <> 1 OR ` +
    `${acceptedDeliveryFilter(options)})))` +
    ` AND (incoming.object_type <> 'node' OR incoming.deleted_at IS NOT NULL OR EXISTS (` +
    `SELECT 1 FROM ${alias}.nodes node_payload WHERE node_payload.id = incoming.object_id))` +
    typeFilter(options.objectType) +
    excludedNodeFilter(options) +
    `)`;
}

export function buildSyncPackNodeUpsertSql(options: SyncPackNodeApplyOptions = {}) {
  const alias = incomingAlias(options);
  const applyableRowsSql = buildSyncPackApplyableRowsSql({
    excludedNodeIds: options.excludedNodeIds,
    incomingAlias: alias,
    objectType: 'node'
  });
  return `WITH RECURSIVE applyable_node_ids(id) AS (` +
    `SELECT object_id FROM ${applyableRowsSql}` +
    `), node_depth(id, depth) AS (` +
    `SELECT incoming.id, 0 FROM ${alias}.nodes incoming WHERE incoming.id IN (SELECT id FROM applyable_node_ids) ` +
    `AND (incoming.parent_id IS NULL OR EXISTS (SELECT 1 FROM main.nodes parent WHERE parent.id = incoming.parent_id)) ` +
    `UNION SELECT child.id, parent.depth + 1 FROM ${alias}.nodes child ` +
    `INNER JOIN node_depth parent ON parent.id = child.parent_id ` +
    `WHERE child.id IN (SELECT id FROM applyable_node_ids)` +
    `) INSERT INTO main.nodes (${SYNC_PACK_NODE_COLUMNS.join(', ')}) ` +
    `SELECT ${SYNC_PACK_NODE_COLUMNS.map((column) => incomingNodeColumnExpression(column, options)).join(', ')} ` +
    `FROM ${alias}.nodes incoming ` +
    `INNER JOIN (SELECT id, MIN(depth) AS depth FROM node_depth GROUP BY id) sorted ON sorted.id = incoming.id ` +
    `WHERE true ORDER BY sorted.depth ASC, incoming.updated_at ASC, incoming.id ASC ` +
    `ON CONFLICT(id) DO UPDATE SET ${SYNC_PACK_NODE_UPDATE_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ')}`;
}

function incomingNodeColumnExpression(column: SyncPackNodeColumn, options: SyncPackNodeApplyOptions) {
  const incomingColumns = options.incomingNodeColumns;
  if (NODE_PROVENANCE_COLUMNS.includes(column as typeof NODE_PROVENANCE_COLUMNS[number])) {
    const hasCompleteColumns = !incomingColumns
      || NODE_PROVENANCE_COLUMNS.every((provenanceColumn) => incomingColumns.includes(provenanceColumn));
    if (!hasCompleteColumns) {
      return `(SELECT existing.${column} FROM main.nodes existing WHERE existing.id = incoming.id)`;
    }
    return `CASE WHEN incoming.import_source_fingerprint IS NULL ` +
      `OR incoming.import_content_fingerprint IS NULL THEN NULL ELSE incoming.${column} END`;
  }
  if (!incomingColumns || incomingColumns.includes(column) || !SYNC_PACK_LEGACY_OPTIONAL_NODE_COLUMNS.has(column)) {
    return `incoming.${column}`;
  }
  return `(SELECT existing.${column} FROM main.nodes existing WHERE existing.id = incoming.id)`;
}

export function buildSyncPackNodeOrderUpsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT OR REPLACE INTO main.node_order (node_id, position) ` +
    `SELECT incoming.node_id, incoming.position FROM ${alias}.node_order incoming ` +
    `INNER JOIN main.nodes node ON node.id = incoming.node_id ` +
    `WHERE incoming.node_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      incomingAlias: alias,
      excludedNodeIds: options.excludedNodeIds,
      objectType: 'node'
    })})`;
}

export function buildSyncPackNodeOrderDeleteSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `DELETE FROM main.node_order WHERE node_id IN (` +
    `SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      excludedNodeIds: options.excludedNodeIds,
      incomingAlias: alias,
      objectType: 'node'
    })}) ` +
    `AND node_id NOT IN (SELECT node_id FROM ${alias}.node_order)`;
}

export function buildSyncPackNodeAttachmentDeleteSql(options: SyncPackApplyableRowsOptions = {}) {
  return `DELETE FROM main.node_attachments WHERE node_id IN (` +
    `SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ ...options, objectType: 'node' })})`;
}

export function buildSyncPackNodeAttachmentInsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT OR REPLACE INTO main.node_attachments (node_id, attachment_id, role) ` +
    `SELECT incoming.node_id, incoming.attachment_id, incoming.role FROM ${alias}.node_attachments incoming ` +
    `INNER JOIN main.attachments attachment ON attachment.id = incoming.attachment_id ` +
    `WHERE incoming.node_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      excludedNodeIds: options.excludedNodeIds,
      incomingAlias: alias,
      objectType: 'node'
    })})`;
}

export function buildSyncPackContentBlobUpsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT INTO main.content_blobs (` +
    `hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes, ` +
    `original_sha256, stored_sha256, availability, source_device_id, created_at, cached_at, last_verified_at) ` +
    `SELECT incoming.hash, incoming.storage_key, incoming.kind, incoming.mime_type, incoming.compression, ` +
    `incoming.original_size_bytes, incoming.stored_size_bytes, incoming.original_sha256, incoming.stored_sha256, ` +
    `CASE WHEN data.hash IS NOT NULL THEN 'cached' ELSE 'missing' END, ` +
    `incoming.source_device_id, incoming.created_at, ` +
    `CASE WHEN data.hash IS NOT NULL THEN incoming.cached_at ELSE NULL END, ` +
    `CASE WHEN data.hash IS NOT NULL THEN incoming.last_verified_at ELSE NULL END ` +
    `FROM ${alias}.content_blobs incoming ` +
    `LEFT JOIN main.content_blob_data data ON data.hash = incoming.hash ` +
    `WHERE incoming.hash IN (` +
    `SELECT body_blob_hash FROM ${alias}.nodes WHERE body_blob_hash IS NOT NULL ` +
    `AND id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      excludedNodeIds: options.excludedNodeIds,
      incomingAlias: alias,
      objectType: 'node'
    })}) ` +
    `UNION SELECT body_blob_hash FROM ${alias}.external_documents WHERE body_blob_hash IS NOT NULL ` +
    `AND document_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      incomingAlias: alias,
      objectType: 'external_document'
    })})) ` +
    `ON CONFLICT(hash) DO UPDATE SET ${SYNC_PACK_CONTENT_BLOB_UPDATE_COLUMNS
      .map((column) => `${column} = excluded.${column}`).join(', ')}`;
}

export function buildSyncPackExternalDocumentUpsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT OR REPLACE INTO main.external_documents (` +
    `document_id, folder_id, relative_path, file_name, extension, source_size_bytes, ` +
    `source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash, ` +
    `content, indexed_at, is_present, missing_at, created_at, updated_at) ` +
    `SELECT document_id, folder_id, relative_path, file_name, extension, source_size_bytes, ` +
    `source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash, ` +
    `content, indexed_at, is_present, missing_at, created_at, updated_at FROM ${alias}.external_documents ` +
    `WHERE document_id IN (` +
    `SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias, objectType: 'external_document' })})`;
}

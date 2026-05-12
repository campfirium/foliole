export interface SyncPackApplyableRowsOptions {
  incomingAlias?: string;
  objectType?: string;
}

export interface SyncPackNodeApplyOptions {
  incomingAlias?: string;
  incomingHasCurrentVersionId?: boolean;
}

function incomingAlias(options: { incomingAlias?: string }) {
  return options.incomingAlias ?? 'inc';
}

function typeFilter(objectType: string | undefined) {
  return objectType ? ` AND incoming.object_type = '${objectType.replaceAll("'", "''")}'` : '';
}

export function buildSyncPackApplyableRowsSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `(SELECT incoming.object_type, incoming.object_id, incoming.state_seq, incoming.content_hash, ` +
    `incoming.updated_at, incoming.deleted_at FROM ${alias}.sync_object_state incoming ` +
    `LEFT JOIN main.sync_object_state current ON current.object_type = incoming.object_type ` +
    `AND current.object_id = incoming.object_id WHERE ` +
    `(current.object_id IS NULL OR (current.updated_at <= incoming.updated_at ` +
    `AND (incoming.object_type = 'view_state' OR current.sync_dirty <> 1 OR EXISTS (` +
    `SELECT 1 FROM main.sync_push_ack ack WHERE ack.object_type = incoming.object_type ` +
    `AND ack.object_id = incoming.object_id AND ack.state_seq IS NOT NULL ` +
    `AND incoming.state_seq >= ack.state_seq AND incoming.content_hash = current.content_hash))))` +
    typeFilter(options.objectType) +
    `)`;
}

export function buildSyncPackNodeUpsertSql(options: SyncPackNodeApplyOptions = {}) {
  const alias = incomingAlias(options);
  const versionExpr = options.incomingHasCurrentVersionId === false
    ? `(SELECT existing.current_version_id FROM main.nodes existing WHERE existing.id = incoming.id)`
    : 'current_version_id';
  return `WITH RECURSIVE applyable_nodes(id, parent_id, depth) AS (` +
    `SELECT incoming.id, incoming.parent_id, 0 FROM ${alias}.nodes incoming ` +
    `WHERE incoming.id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      incomingAlias: alias,
      objectType: 'node'
    })}) AND (incoming.parent_id IS NULL OR incoming.parent_id NOT IN (SELECT id FROM ${alias}.nodes)) ` +
    `UNION ALL SELECT child.id, child.parent_id, applyable_nodes.depth + 1 FROM ${alias}.nodes child ` +
    `INNER JOIN applyable_nodes ON child.parent_id = applyable_nodes.id ` +
    `WHERE child.id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      incomingAlias: alias,
      objectType: 'node'
    })})) ` +
    `INSERT OR REPLACE INTO main.nodes (` +
    `id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, ` +
    `opening_text, content, current_version_id, created_at, updated_at, deleted_at) ` +
    `SELECT incoming.id, incoming.parent_id, incoming.kind, incoming.title, incoming.is_title_manual, ` +
    `incoming.hide_title_heading, incoming.body_blob_hash, incoming.opening_text, incoming.content, ` +
    `${versionExpr}, incoming.created_at, incoming.updated_at, incoming.deleted_at FROM ${alias}.nodes incoming ` +
    `INNER JOIN applyable_nodes ON applyable_nodes.id = incoming.id ORDER BY applyable_nodes.depth ASC`;
}

export function buildSyncPackNodeOrderUpsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT OR REPLACE INTO main.node_order (node_id, position) ` +
    `SELECT incoming.node_id, incoming.position FROM ${alias}.node_order incoming ` +
    `INNER JOIN main.nodes node ON node.id = incoming.node_id AND node.kind = 'folder' ` +
    `WHERE incoming.node_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      incomingAlias: alias,
      objectType: 'node'
    })})`;
}

export function buildSyncPackNodeOrderDeleteSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `DELETE FROM main.node_order WHERE node_id IN (` +
    `SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias, objectType: 'node' })}) ` +
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
    `WHERE incoming.node_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias, objectType: 'node' })})`;
}

export function buildSyncPackContentBlobUpsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT OR REPLACE INTO main.content_blobs (` +
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
    `AND id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias, objectType: 'node' })}) ` +
    `UNION SELECT body_blob_hash FROM ${alias}.external_documents WHERE body_blob_hash IS NOT NULL ` +
    `AND document_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({
      incomingAlias: alias,
      objectType: 'external_document'
    })}))`;
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

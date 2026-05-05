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
    `AND (current.sync_dirty <> 1 OR EXISTS (` +
    `SELECT 1 FROM main.sync_push_ack ack WHERE ack.object_type = incoming.object_type ` +
    `AND ack.object_id = incoming.object_id AND ack.state_seq IS NOT NULL ` +
    `AND incoming.state_seq >= ack.state_seq AND incoming.content_hash = current.content_hash))))` +
    typeFilter(options.objectType) +
    `)`;
}

export function buildSyncPackNodeUpsertSql(options: SyncPackNodeApplyOptions = {}) {
  const alias = incomingAlias(options);
  const versionExpr = options.incomingHasCurrentVersionId === false
    ? `(SELECT existing.current_version_id FROM main.nodes existing WHERE existing.id = ${alias}.nodes.id)`
    : 'current_version_id';
  return `INSERT OR REPLACE INTO main.nodes (` +
    `id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, ` +
    `opening_text, content, current_version_id, created_at, updated_at, deleted_at) ` +
    `SELECT id, parent_id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, ` +
    `opening_text, content, ${versionExpr}, created_at, updated_at, deleted_at FROM ${alias}.nodes ` +
    `WHERE id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias, objectType: 'node' })})`;
}

export function buildSyncPackNodeAttachmentDeleteSql(options: SyncPackApplyableRowsOptions = {}) {
  return `DELETE FROM main.node_attachments WHERE node_id IN (` +
    `SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ ...options, objectType: 'node' })})`;
}

export function buildSyncPackNodeAttachmentInsertSql(options: SyncPackApplyableRowsOptions = {}) {
  const alias = incomingAlias(options);
  return `INSERT OR REPLACE INTO main.node_attachments (node_id, attachment_id, role) ` +
    `SELECT node_id, attachment_id, role FROM ${alias}.node_attachments ` +
    `WHERE node_id IN (SELECT object_id FROM ${buildSyncPackApplyableRowsSql({ incomingAlias: alias, objectType: 'node' })})`;
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

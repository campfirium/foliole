import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../platform/syncProtocolContract.js';
import { DATABASE_SCHEMA_VERSION } from '../database/databaseSchemaVersion.js';

import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from './syncObjectPayloadSql.js';
import { SYNC_PACK_DATABASE_ENTRY, SYNC_PACK_FORMAT, SYNC_PACK_FORMAT_VERSION } from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { SYNC_PACK_NODE_COLUMNS } from './syncPackNodeFields.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

const nodeColumns = SYNC_PACK_NODE_COLUMNS.join(', ');
const payloadCopyStatements = Object.entries(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE).map(([objectType, sql]) =>
  `INSERT INTO sync_objects
   SELECT s.object_type, s.object_id, s.content_hash,
     CASE WHEN s.deleted_at IS NULL THEN (${sql.replace('?', 's.object_id')}) ELSE NULL END,
     s.updated_at, s.deleted_at FROM sync_object_state s WHERE s.object_type = '${objectType}'`
);

const viewStateCopyStatement = `INSERT INTO sync_objects
  SELECT s.object_type, s.object_id, s.content_hash, CASE WHEN s.deleted_at IS NOT NULL THEN NULL
    WHEN s.object_id LIKE '%:active_node' THEN
      (SELECT json_object('active_node_id', NULLIF(value, ''), 'updated_at', updated_at)
       FROM source.workspace_meta WHERE key = 'active_node_id')
    ELSE (SELECT json_object('node_id', v.node_id, 'scroll_top', v.scroll_top,
      'selection_from', v.selection_from, 'selection_to', v.selection_to, 'source', v.source, 'updated_at', v.updated_at)
      FROM source.node_view_state v WHERE s.object_id LIKE '%:' || v.device_id || ':node:' || v.node_id LIMIT 1)
    END, s.updated_at, s.deleted_at FROM sync_object_state s WHERE s.object_type = 'view_state'`;

export const ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS = {
  compression: 'zlib',
  completenessQueries: {
    attachments: `SELECT attachment_id, storage_key, content_hash FROM attachment_blobs
      WHERE content_hash IS NOT NULL ORDER BY attachment_id`,
    missingContentBlobCount: `SELECT COUNT(*) FROM content_blobs cb
      LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash
      WHERE cbd.hash IS NULL OR cb.compression != 'none' OR cb.original_sha256 != cb.hash
        OR cb.stored_sha256 != cb.hash OR length(cbd.data) != cb.stored_size_bytes`
  },
  copyStatements: [
    `INSERT INTO sync_object_state SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at
     FROM source.sync_object_state WHERE state_seq > ? AND state_seq <= ? AND object_type IN
       ('attachment','external_document','external_folder','import_source','node','node_open_state','node_reading',
        'node_review','node_text_alternative','pdf_page_text','setting','view_state')
       AND (object_type != 'node' OR deleted_at IS NOT NULL OR EXISTS
         (SELECT 1 FROM source.nodes WHERE id = source.sync_object_state.object_id))
       AND (object_type NOT IN ('node_reading','node_review') OR EXISTS
         (SELECT 1 FROM source.nodes WHERE id = source.sync_object_state.object_id))
       `,
    `INSERT OR IGNORE INTO sync_object_state SELECT s.object_type, s.object_id, s.state_seq, s.content_hash, s.updated_at, s.deleted_at
     FROM source.sync_object_state s WHERE s.object_type = 'node' AND s.object_id IN
       (SELECT object_id FROM sync_object_state WHERE object_type IN ('node_reading','node_review'))`,
    ...payloadCopyStatements,
    viewStateCopyStatement,
    `DELETE FROM sync_object_state WHERE object_type NOT IN ('external_document','node') AND NOT EXISTS
      (SELECT 1 FROM sync_objects o WHERE o.object_type = sync_object_state.object_type AND o.object_id = sync_object_state.object_id)`,
    `INSERT INTO nodes (${nodeColumns}) SELECT ${nodeColumns} FROM source.nodes
     WHERE id IN (SELECT object_id FROM sync_object_state WHERE object_type = 'node')`,
    `INSERT INTO node_sync_versions SELECT v.version_id, v.object_id, v.parent_version_id, v.device_id,
       v.created_at, v.content_hash, v.body_text, v.snapshot_json FROM source.node_sync_versions v
     WHERE v.object_id IN (SELECT id FROM nodes)`,
    `INSERT INTO node_sync_version_parents SELECT p.version_id, p.parent_version_id, p.ordinal
     FROM source.node_sync_version_parents p WHERE p.version_id IN (SELECT version_id FROM node_sync_versions)`,
    `INSERT INTO node_order SELECT o.node_id, o.position FROM source.node_order o WHERE o.node_id IN (SELECT id FROM nodes)`,
    `INSERT INTO node_attachments SELECT a.node_id, a.attachment_id, a.role FROM source.node_attachments a
     WHERE a.node_id IN (SELECT id FROM nodes)`,
    `INSERT INTO external_documents SELECT d.document_id, d.folder_id, d.relative_path, d.file_name, d.extension,
       d.source_size_bytes, d.source_modified_at, d.source_modified_ms, d.content_hash, d.title, d.opening_text,
       d.body_blob_hash, '', d.indexed_at, d.is_present, d.missing_at, d.created_at, d.updated_at
     FROM source.external_documents d WHERE d.document_id IN
       (SELECT object_id FROM sync_object_state WHERE object_type = 'external_document')`,
    `INSERT INTO content_blobs SELECT b.hash, b.storage_key, b.kind, b.mime_type, b.compression,
       b.original_size_bytes, b.stored_size_bytes, b.original_sha256, b.stored_sha256, b.availability,
       b.source_device_id, b.created_at, b.cached_at, b.last_verified_at FROM source.content_blobs b
     WHERE b.hash IN (SELECT body_blob_hash FROM nodes WHERE body_blob_hash IS NOT NULL
       UNION SELECT body_blob_hash FROM external_documents WHERE body_blob_hash IS NOT NULL)`,
    `INSERT INTO review_log SELECT r.id, r.op_id, r.device_id, r.node_id, r.grade, r.scheduler_version,
       r.reviewed_at, r.due_before, r.stability_before, r.difficulty_before, r.due_after,
       r.stability_after, r.difficulty_after FROM source.review_log r
     WHERE r.node_id IN (SELECT object_id FROM sync_object_state WHERE object_type = 'node_review')`
  ],
  databaseEntry: SYNC_PACK_DATABASE_ENTRY,
  format: SYNC_PACK_FORMAT,
  formatVersion: SYNC_PACK_FORMAT_VERSION,
  packSchema: PACK_SCHEMA,
  protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  schemaVersion: DATABASE_SCHEMA_VERSION,
  tableNames: SYNC_PACK_TABLE_NAMES
} as const;

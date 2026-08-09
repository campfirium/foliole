import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../platform/syncProtocolContract.js';
import { DATABASE_SCHEMA_VERSION } from '../database/databaseSchemaVersion.js';

import { SYNC_PACK_DATABASE_ENTRY, SYNC_PACK_FORMAT, SYNC_PACK_FORMAT_VERSION } from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { SYNC_PACK_NODE_COLUMNS } from './syncPackNodeFields.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

const nodeColumns = SYNC_PACK_NODE_COLUMNS.join(', ');
const payloadPlans = [
  { objectType: 'attachment', sql: `SELECT a.id __object_id, a.id attachment_id, a.original_name, a.mime_type, a.size_bytes, a.created_at,
    b.content_hash blob__content_hash, b.storage_key blob__storage_key, b.size_bytes blob__size_bytes,
    b.mime_type blob__mime_type, b.availability blob__availability, b.source_device_id blob__source_device_id,
    b.created_at blob__created_at, b.cached_at blob__cached_at, b.last_verified_at blob__last_verified_at
    FROM source.attachments a LEFT JOIN source.attachment_blobs b ON b.attachment_id = a.id` },
  { objectType: 'external_folder', sql: `SELECT id __object_id, id, folder_path, attachment_mode, attachment_root_path, excluded_dirs_json,
    status, document_count, indexed_at, last_error, owner_installation_id, owner_device_name, owner_platform, created_at, updated_at
    FROM source.external_search_folders` },
  { objectType: 'import_source', sql: `SELECT source_fingerprint __object_id, source_fingerprint, provider, source_kind, source_name, source_locator,
    first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
    FROM source.import_sources` },
  { objectType: 'node_open_state', sql: `SELECT node_id __object_id, node_id, last_opened_at FROM source.node_open_state` },
  { objectType: 'node_reading', sql: `SELECT node_id __object_id, node_id, interval_duration_ms, interval_growth_factor,
    last_handled_at, next_at, priority, repetition_count, state FROM source.node_reading` },
  { objectType: 'node_review', sql: `SELECT node_id __object_id, node_id, due, last_review_at, state, stability, difficulty,
    elapsed_days, scheduled_days, reps, lapses FROM source.node_review` },
  { objectType: 'node_text_alternative', sql: `SELECT alternative_id __object_id, alternative_id, node_id, source_version_id,
    body_text, source_device_id, created_at, status, updated_at FROM source.node_text_alternatives` },
  { objectType: 'pdf_page_text', sql: `SELECT attachment_id || ':' || page __object_id,
    attachment_id, page, text, page_width, page_height FROM source.pdf_page_text` },
  { objectType: 'setting', sql: `SELECT scope || ':' || platform || ':' || form_factor || ':' || device_id || ':' || key __object_id,
    key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at, deleted_at FROM source.setting_records` },
  { objectType: 'view_state', sql: `SELECT s.object_id __object_id, NULLIF(m.value, '') active_node_id, m.updated_at
    FROM source.sync_object_state s JOIN source.workspace_meta m ON m.key = 'active_node_id'
    WHERE s.object_type = 'view_state' AND s.object_id LIKE '%:active_node'` },
  { objectType: 'view_state', sql: `SELECT s.object_id __object_id,
    v.node_id, v.scroll_top, v.selection_from, v.selection_to, v.source, v.updated_at
    FROM source.sync_object_state s JOIN source.node_view_state v
      ON s.object_id LIKE '%:' || v.device_id || ':node:' || v.node_id
    WHERE s.object_type = 'view_state' AND s.object_id NOT LIKE '%:active_node'` }
] as const;

export const ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS = {
  compression: 'zlib',
  copyStatements: [
    `INSERT INTO sync_groups SELECT group_id, display_name, timeline_id, created_by_device_id, created_at
     FROM source.sync_groups WHERE group_id IN (SELECT group_id FROM source.sync_group_local_state WHERE singleton_id = 1)`,
    `INSERT INTO sync_group_members SELECT group_id, device_id, device_kind, device_name, state,
       approved_by_device_id, authorization_id, joined_at, left_at, updated_at
     FROM source.sync_group_members
     WHERE group_id IN (SELECT group_id FROM sync_groups) AND state IN ('active', 'left')`,
    `INSERT INTO sync_group_member_departures SELECT group_id, device_id, authorized_by_device_id,
       authorization_id, left_at FROM source.sync_group_member_departures
     WHERE group_id IN (SELECT group_id FROM sync_groups)`,
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
  payloadCopyIndex: 5,
  payloadPlans,
  packSchema: PACK_SCHEMA,
  protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  schemaVersion: DATABASE_SCHEMA_VERSION,
  stateCopyIndex: 3,
  tableNames: SYNC_PACK_TABLE_NAMES
} as const;

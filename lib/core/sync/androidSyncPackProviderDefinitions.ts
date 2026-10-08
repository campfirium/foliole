import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../platform/syncProtocolContract.js';

import { COMPLETE_MEMBER_DATA_PLANE_CONTRACT } from './completeMemberDataPlaneContract.js';
import { nodeVersionDependenciesCopySql } from './nodeVersionDependencies.js';
import { SYNC_IDENTITY_NATIVE_FACT_HEAD_COPY_SQL, SYNC_IDENTITY_NATIVE_FACT_PLANS,
  SYNC_IDENTITY_NATIVE_FACT_VALIDATE_SQL } from './syncIdentityNativeFactPackSql.js';
import { SYNC_IDENTITY_NATIVE_HEAD_COPY_SQL, SYNC_IDENTITY_NATIVE_PRELUDE_COPY_SQL,
  SYNC_IDENTITY_NATIVE_REVIEW_COPY_SQL, SYNC_IDENTITY_NATIVE_MISSING_ORIGINAL_HEAD_SQL,
  SYNC_IDENTITY_NATIVE_STATE_COPY_SQL, SYNC_IDENTITY_NATIVE_THIN_PRELUDE_SQL } from './syncIdentityNativePackSql.js';
import {
  SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION,
  SYNC_PACK_PAYLOAD_SCHEMA_VERSION
} from './syncPackEnvelopeContract.js';
import { SYNC_PACK_TABLE_NAMES } from './syncPackManifest.js';
import { SYNC_PACK_NODE_COLUMNS } from './syncPackNodeFields.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

const nodeColumns = SYNC_PACK_NODE_COLUMNS.join(', ');
const nodeSelectColumns = SYNC_PACK_NODE_COLUMNS.map((column) =>
  column === 'content' ? "'' AS content" : column).join(', ');
const versionPreflightSql = `WITH RECURSIVE selected(id) AS (
    SELECT object_id FROM sync_object_state WHERE state_seq > ? AND state_seq <= ?
      AND object_type IN ('node', 'node_open_state', 'node_reading', 'node_review', 'parent_child_order')
    UNION SELECT a.node_id FROM node_text_alternatives a JOIN sync_object_state s
      ON s.object_type = 'node_text_alternative' AND s.object_id = a.alternative_id
    WHERE s.state_seq > ? AND s.state_seq <= ?
  ), ancestry(id, parent_id) AS (
    SELECT node.id, node.parent_id FROM nodes node JOIN selected ON selected.id = node.id
    UNION SELECT parent.id, parent.parent_id FROM nodes parent
      JOIN ancestry child ON child.parent_id = parent.id
  ) SELECT COUNT(*) AS rows,
  COALESCE(SUM(COALESCE(length(CAST(v.body_text AS BLOB)), 0) +
    length(CAST(v.snapshot_json AS BLOB)) + 512), 0) AS bytes
  FROM node_sync_versions v WHERE v.object_id IN (SELECT id FROM ancestry UNION SELECT id FROM selected)`;
const payloadPlans = [
  { objectType: 'node_position', sql: `SELECT fact_id __object_id,
    adopted_version_id, device_identity_key, group_id, library_epoch, object_id,
    pending_version_ids_json, proof_revision, updated_at FROM source.node_version_member_positions` },
  { objectType: 'order_version', sql: `SELECT version_id __object_id, child_ids_json,
    created_at, kind, parent_id, parent_version_ids_json, version_id
    FROM source.parent_order_versions` },
  { objectType: 'foreground_daily_time', sql: `SELECT id __object_id, source_id, day_key, duration_ms
    FROM source.foreground_daily_time` },
  { objectType: 'topic_daily_count', sql: `SELECT id __object_id, day_key, node_id
    FROM source.topic_daily_count_entries` },
  { objectType: 'external_folder', sql: `SELECT f.id __object_id, f.id, f.folder_path, f.attachment_mode,
    f.attachment_root_path, f.excluded_dirs_json, f.status, f.document_count, f.indexed_at, f.last_error,
    s.host_name, s.host_platform, s.type_settings_json, f.created_at, f.updated_at, f.source_ref
    FROM source.external_search_folders f JOIN source.desktop_sources s ON s.source_ref = f.source_ref` },
  { objectType: 'import_source', sql: `SELECT source_fingerprint __object_id, source_fingerprint, provider, source_kind, source_name,
    CASE WHEN watched_binding_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM source.desktop_sources s WHERE s.source_ref = import_sources.source_ref AND s.source_type = 'watched'
    ) THEN '' ELSE source_locator END source_locator,
    first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id,
    watched_binding_id, watched_relative_path, source_ref, source_location,
    remote_provider, remote_connection_ref, remote_document_id, remote_annotations_json, remote_import_state_json
    FROM source.import_sources` },
  { objectType: 'node_open_state', sql: `SELECT node_id __object_id, node_id, last_opened_at FROM source.node_open_state` },
  { objectType: 'parent_child_order', sql: `SELECT parent_id __object_id, parent_id, child_ids_json, updated_at
    FROM source.parent_child_order` },
  { objectType: 'node_reading', sql: `SELECT node_id __object_id, node_id, interval_duration_ms, interval_growth_factor,
    last_handled_at, next_at, priority, repetition_count, state FROM source.node_reading` },
  { objectType: 'node_review', sql: `SELECT node_id __object_id, node_id, due, last_review_at, state, stability, difficulty,
    elapsed_days, scheduled_days, reps, lapses FROM source.node_review` },
  { objectType: 'node_text_alternative', sql: `SELECT alternative_id __object_id, alternative_id, node_id, source_version_id,
    body_text, source_host_name, created_at, status, updated_at FROM source.node_text_alternatives` },
  { objectType: 'pdf_page_text', sql: `SELECT attachment_id || ':' || page __object_id,
    attachment_id, page, text, page_width, page_height FROM source.pdf_page_text` },
  { objectType: 'setting', sql: `SELECT scope || ':' || platform || ':' || form_factor || ':' || host_name || ':' || key __object_id,
    key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at, deleted_at FROM source.setting_records` },
  { objectType: 'view_state', sql: `SELECT s.object_id __object_id, NULLIF(m.value, '') active_node_id, m.updated_at
    FROM source.sync_object_state s JOIN source.workspace_meta m ON m.key = 'active_node_id'
    WHERE s.object_type = 'view_state' AND s.object_id LIKE '%:active_node'` },
  { objectType: 'view_state', sql: `SELECT s.object_id __object_id,
    v.node_id, v.scroll_top, v.selection_from, v.selection_to, v.source, v.updated_at
    FROM source.sync_object_state s JOIN source.node_view_state v
      ON s.object_id LIKE '%:' || v.host_name || ':node:' || v.node_id
    WHERE s.object_type = 'view_state' AND s.object_id NOT LIKE '%:active_node'` },
  { objectType: 'watched_folder', sql: `SELECT b.binding_id __object_id, b.binding_id,
    s.host_name, s.host_platform, b.owner_device_identity_key, b.connection_status, b.action_mode,
    b.highlight_mode, b.reported_path, b.created_at, b.updated_at, b.source_ref
    FROM source.watched_folder_bindings b JOIN source.desktop_sources s ON s.source_ref = b.source_ref` }
] as const;

export const ANDROID_SYNC_PACK_PROVIDER_DEFINITIONS = {
  compression: 'zlib',
  identityThinPreludeSql: SYNC_IDENTITY_NATIVE_THIN_PRELUDE_SQL,
  identityMissingOriginalHeadSql: SYNC_IDENTITY_NATIVE_MISSING_ORIGINAL_HEAD_SQL,
  identityFactPlans: SYNC_IDENTITY_NATIVE_FACT_PLANS,
  identityFactValidateSql: SYNC_IDENTITY_NATIVE_FACT_VALIDATE_SQL,
  identityFactHeadCopySql: SYNC_IDENTITY_NATIVE_FACT_HEAD_COPY_SQL,
  identityStateCopySql: SYNC_IDENTITY_NATIVE_STATE_COPY_SQL,
  identityPreludeCopySql: SYNC_IDENTITY_NATIVE_PRELUDE_COPY_SQL,
  identityReviewCopySql: SYNC_IDENTITY_NATIVE_REVIEW_COPY_SQL,
  identityHeadCopySql: SYNC_IDENTITY_NATIVE_HEAD_COPY_SQL,
  copyStatements: [
    `INSERT INTO sync_groups SELECT group_id, display_name, created_at
     FROM source.sync_groups WHERE group_id IN (SELECT group_id FROM source.sync_group_local_state WHERE singleton_id = 1)`,
    `INSERT INTO sync_group_devices SELECT group_id, device_identity_key, device_anchor,
       canonical_library_path, device_name, platform, state, joined_at, left_at, last_seen_at, updated_at
     FROM source.sync_group_devices
     WHERE group_id IN (SELECT group_id FROM sync_groups) AND state IN ('active', 'left')`,
    `INSERT INTO sync_object_state SELECT state.object_type, state.object_id, state.state_seq,
       state.content_hash, state.last_modified_by_host_name, state.updated_at,
       CASE WHEN state.object_type = 'node_text_alternative' THEN COALESCE(state.deleted_at,
         (SELECT node.deleted_at FROM source.node_text_alternatives alternative
          JOIN source.nodes node ON node.id = alternative.node_id
          WHERE alternative.alternative_id = state.object_id)) ELSE state.deleted_at END
     FROM source.sync_object_state state WHERE state.state_seq > ? AND state.state_seq <= ? AND state.object_type IN
       ('external_document','external_folder','import_source','node','node_open_state','node_reading',
        'node_review','node_text_alternative','parent_child_order','order_version','node_position','pdf_page_text','setting','view_state','watched_folder','topic_daily_count','foreground_daily_time')
       AND (state.object_type != 'node' OR state.deleted_at IS NOT NULL OR EXISTS
         (SELECT 1 FROM source.nodes WHERE id = state.object_id))
       AND (state.object_type NOT IN ('node_reading','node_review') OR state.deleted_at IS NOT NULL OR EXISTS
         (SELECT 1 FROM source.nodes WHERE id = state.object_id))
       `,
    `WITH RECURSIVE node_prelude(id, parent_id) AS (
       SELECT node.id, node.parent_id FROM source.nodes node WHERE node.id IN
         (SELECT object_id FROM sync_object_state WHERE object_type IN
            ('node','node_open_state','node_reading','node_review','parent_child_order')
          UNION SELECT alternative.node_id FROM source.node_text_alternatives alternative
            JOIN sync_object_state selected ON selected.object_type = 'node_text_alternative'
              AND selected.object_id = alternative.alternative_id)
       UNION SELECT parent.id, parent.parent_id FROM source.nodes parent
         JOIN node_prelude child ON child.parent_id = parent.id
     ) INSERT OR IGNORE INTO sync_object_state SELECT s.object_type, s.object_id, s.state_seq,
       s.content_hash, s.last_modified_by_host_name, s.updated_at, s.deleted_at
     FROM source.sync_object_state s JOIN node_prelude prelude ON prelude.id = s.object_id
     WHERE s.object_type = 'node'`,
    `DELETE FROM sync_object_state WHERE object_type NOT IN ('external_document','node') AND NOT EXISTS
      (SELECT 1 FROM sync_objects o WHERE o.object_type = sync_object_state.object_type AND o.object_id = sync_object_state.object_id)`,
    `INSERT INTO nodes (${nodeColumns}) SELECT ${nodeSelectColumns} FROM source.nodes
     WHERE id IN (SELECT object_id FROM sync_object_state WHERE object_type = 'node')`,
    `INSERT INTO node_sync_versions SELECT v.version_id, v.object_id, v.parent_version_id, v.host_name,
       v.created_at, v.content_hash, v.body_text, v.snapshot_json
     FROM source.node_sync_versions v WHERE v.object_id IN
       (SELECT object_id FROM sync_object_state WHERE object_type = 'node')`,
    `INSERT INTO node_sync_tombstones SELECT t.node_id, t.version_id, t.parent_version_id,
       t.host_name, t.content_hash, t.snapshot_json, t.deleted_at, t.created_at
     FROM source.node_sync_tombstones t WHERE t.node_id IN
       (SELECT object_id FROM sync_object_state WHERE object_type = 'node' AND deleted_at IS NOT NULL)`,
    `INSERT INTO node_sync_version_parents SELECT p.version_id, p.parent_version_id, p.ordinal
     FROM source.node_sync_version_parents p
     WHERE p.version_id IN (SELECT version_id FROM node_sync_versions)
       AND p.parent_version_id IN (SELECT version_id FROM node_sync_versions)`,
    `INSERT INTO external_documents SELECT d.document_id, d.folder_id, d.relative_path, d.file_name, d.extension,
       d.source_size_bytes, d.source_modified_at, d.source_modified_ms, d.content_hash, d.title, d.opening_text,
       d.body_blob_hash, d.content, d.reference_kind, d.reference_json, d.indexed_at, d.is_present, d.missing_at,
       d.created_at, d.updated_at
     FROM source.external_documents d WHERE d.document_id IN
       (SELECT object_id FROM sync_object_state WHERE object_type = 'external_document')`,
    `INSERT INTO content_blobs SELECT b.hash, b.storage_key, b.kind, b.mime_type, b.compression,
       b.original_size_bytes, b.stored_size_bytes, b.original_sha256, b.stored_sha256, b.availability,
       b.source_host_name, b.created_at, b.cached_at, b.last_verified_at FROM source.content_blobs b
     WHERE b.hash IN (SELECT body_blob_hash FROM nodes WHERE body_blob_hash IS NOT NULL
       UNION SELECT body_blob_hash FROM external_documents WHERE body_blob_hash IS NOT NULL)`,
    `INSERT INTO review_log SELECT r.id, r.op_id, r.host_name, r.node_id, r.grade, r.scheduler_version,
       r.reviewed_at, r.due_before, r.stability_before, r.difficulty_before, r.due_after,
       r.stability_after, r.difficulty_after FROM source.review_log r
     WHERE r.node_id IN (SELECT object_id FROM sync_object_state WHERE object_type = 'node_review')`,
    nodeVersionDependenciesCopySql()
  ],
  databaseEntry: SYNC_PACK_DATABASE_ENTRY,
  format: SYNC_PACK_FORMAT,
  formatVersion: SYNC_PACK_FORMAT_VERSION,
  payloadCopyIndex: 4,
  reviewCopyIndex: 11,
  payloadPlans,
  preparedMemberDataPlane: COMPLETE_MEMBER_DATA_PLANE_CONTRACT,
  packSchema: PACK_SCHEMA,
  protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  schemaVersion: SYNC_PACK_PAYLOAD_SCHEMA_VERSION,
  stateCopyIndex: 2,
  tableNames: SYNC_PACK_TABLE_NAMES,
  versionPreflightSql
} as const;

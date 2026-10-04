export const SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE = {
  node_position: `SELECT json_object('adopted_version_id', adopted_version_id,
    'device_identity_key', device_identity_key, 'group_id', group_id,
    'library_epoch', library_epoch, 'object_id', object_id,
    'pending_version_ids_json', pending_version_ids_json, 'proof_revision', proof_revision,
    'updated_at', updated_at) AS payload_json FROM node_version_member_positions WHERE fact_id = ?`,
  order_version: `SELECT json_object('child_ids_json', child_ids_json,
    'created_at', created_at, 'kind', kind, 'parent_id', parent_id,
    'parent_version_ids_json', parent_version_ids_json, 'version_id', version_id)
    AS payload_json FROM parent_order_versions WHERE version_id = ?`,
  foreground_daily_time: `SELECT json_object('source_id', source_id, 'day_key', day_key, 'duration_ms', duration_ms)
    AS payload_json FROM foreground_daily_time WHERE id = ?`,
  topic_daily_count: `SELECT json_object('day_key', day_key, 'node_id', node_id)
    AS payload_json FROM topic_daily_count_entries WHERE id = ?`,
  parent_child_order: `SELECT json_object(
    'parent_id', parent_id, 'child_ids_json', child_ids_json
  ) AS payload_json FROM parent_child_order WHERE parent_id = ?`,
  external_folder: `SELECT json_object(
    'id', f.id, 'folder_path', f.folder_path, 'attachment_mode', f.attachment_mode,
    'attachment_root_path', f.attachment_root_path, 'excluded_dirs_json', f.excluded_dirs_json,
    'status', f.status, 'document_count', f.document_count, 'indexed_at', f.indexed_at,
    'last_error', f.last_error, 'host_name', s.host_name, 'host_platform', s.host_platform,
    'type_settings_json', s.type_settings_json, 'created_at', f.created_at,
    'updated_at', f.updated_at, 'source_ref', f.source_ref
  ) AS payload_json FROM external_search_folders f
    JOIN desktop_sources s ON s.source_ref = f.source_ref WHERE f.id = ?`,
  import_source: `SELECT json_object(
    'source_fingerprint', source_fingerprint, 'provider', provider, 'source_kind', source_kind,
    'source_name', source_name, 'source_locator', CASE WHEN watched_binding_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM desktop_sources s WHERE s.source_ref = import_sources.source_ref AND s.source_type = 'watched'
    ) THEN '' ELSE source_locator END,
    'first_imported_at', first_imported_at,
    'last_imported_at', last_imported_at, 'last_content_fingerprint', last_content_fingerprint,
    'latest_node_id', latest_node_id, 'watched_binding_id', watched_binding_id,
    'watched_relative_path', watched_relative_path, 'source_ref', source_ref,
    'source_location', source_location, 'remote_provider', remote_provider,
    'remote_connection_ref', remote_connection_ref, 'remote_document_id', remote_document_id,
    'remote_annotations_json', remote_annotations_json, 'remote_import_state_json', remote_import_state_json
  ) AS payload_json FROM import_sources WHERE source_fingerprint = ?`,
  node_open_state: `SELECT json_object('node_id', node_id, 'last_opened_at', last_opened_at) AS payload_json
    FROM node_open_state WHERE node_id = ?`,
  node_reading: `SELECT json_object(
    'node_id', node_id, 'interval_duration_ms', interval_duration_ms,
    'interval_growth_factor', interval_growth_factor, 'last_handled_at', last_handled_at,
    'next_at', next_at, 'priority', priority, 'repetition_count', repetition_count, 'state', state
  ) AS payload_json FROM node_reading WHERE node_id = ?`,
  node_review: `SELECT json_object(
    'node_id', node_id, 'due', due, 'last_review_at', last_review_at, 'state', state,
    'stability', stability, 'difficulty', difficulty, 'elapsed_days', elapsed_days,
    'scheduled_days', scheduled_days, 'reps', reps, 'lapses', lapses
  ) AS payload_json FROM node_review WHERE node_id = ?`,
  node_text_alternative: `SELECT json_object(
    'alternative_id', alternative_id, 'node_id', node_id, 'source_version_id', source_version_id,
    'body_text', body_text, 'source_host_name', source_host_name, 'created_at', created_at,
    'status', status, 'updated_at', updated_at
  ) AS payload_json FROM node_text_alternatives WHERE alternative_id = ?`,
  pdf_page_text: `SELECT json_object(
    'attachment_id', attachment_id, 'page', page, 'text', text,
    'page_width', page_width, 'page_height', page_height
  ) AS payload_json FROM pdf_page_text WHERE attachment_id || ':' || page = ?`,
  setting: `SELECT json_object(
    'key', key, 'scope', scope, 'platform', platform, 'form_factor', form_factor,
    'host_name', host_name, 'value_json', value_json, 'content_hash', content_hash,
    'updated_at', updated_at, 'deleted_at', deleted_at
  ) AS payload_json FROM setting_records
    WHERE scope || ':' || platform || ':' || form_factor || ':' || host_name || ':' || key = ?`,
  watched_folder: `SELECT json_object(
    'binding_id', b.binding_id, 'host_name', s.host_name, 'host_platform', s.host_platform,
    'owner_device_identity_key', b.owner_device_identity_key,
    'connection_status', b.connection_status, 'action_mode', b.action_mode,
    'highlight_mode', b.highlight_mode, 'reported_path', b.reported_path,
    'created_at', b.created_at, 'updated_at', b.updated_at, 'source_ref', b.source_ref
  ) AS payload_json FROM watched_folder_bindings b
    JOIN desktop_sources s ON s.source_ref = b.source_ref WHERE b.binding_id = ?`
} as const;

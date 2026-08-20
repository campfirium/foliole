export const SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE = {
  attachment: `SELECT json_object(
    'attachment_id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type,
    'size_bytes', a.size_bytes, 'created_at', a.created_at, 'blob', json_object(
      'content_hash', b.content_hash, 'storage_key', b.storage_key, 'size_bytes', b.size_bytes,
      'mime_type', b.mime_type, 'availability', b.availability, 'source_host_name', b.source_host_name,
      'created_at', b.created_at, 'cached_at', b.cached_at, 'last_verified_at', b.last_verified_at
    )) AS payload_json FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id WHERE a.id = ?`,
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
    'source_name', source_name, 'source_locator', source_locator, 'first_imported_at', first_imported_at,
    'last_imported_at', last_imported_at, 'last_content_fingerprint', last_content_fingerprint,
    'latest_node_id', latest_node_id, 'watched_binding_id', watched_binding_id,
    'watched_relative_path', watched_relative_path, 'source_ref', source_ref,
    'source_location', source_location
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
    'type_settings_json', s.type_settings_json, 'connection_status', b.connection_status,
    'action_mode', b.action_mode, 'archive_path', b.archive_path,
    'highlight_mode', b.highlight_mode, 'highlight_path', b.highlight_path, 'primary_path', b.primary_path,
    'created_at', b.created_at, 'updated_at', b.updated_at, 'source_ref', b.source_ref
  ) AS payload_json FROM watched_folder_bindings b
    JOIN desktop_sources s ON s.source_ref = b.source_ref WHERE b.binding_id = ?`
} as const;

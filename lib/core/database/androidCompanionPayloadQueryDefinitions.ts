export const ANDROID_COMPANION_PAYLOAD_QUERY_DEFINITIONS = {
  syncPayloadAttachment: {
    syncPayload: { objectType: 'attachment' },
    sql:
      "SELECT json_object('attachment_id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, " +
      "'size_bytes', a.size_bytes, 'created_at', a.created_at, 'blob', json_object(" +
      "'content_hash', b.content_hash, 'storage_key', b.storage_key, 'size_bytes', b.size_bytes, " +
      "'mime_type', b.mime_type, 'availability', b.availability, 'source_device_id', b.source_device_id, " +
      "'created_at', b.created_at, 'cached_at', b.cached_at, 'last_verified_at', b.last_verified_at)) AS payload_json " +
      'FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id WHERE a.id = ? LIMIT 1'
  },
  syncPayloadExternalDocument: {
    syncPayload: { objectType: 'external_document' },
    sql:
      "SELECT json_object('document_id', document_id, 'folder_id', folder_id, 'relative_path', relative_path, " +
      "'file_name', file_name, 'extension', extension, 'source_size_bytes', source_size_bytes, " +
      "'source_modified_at', source_modified_at, 'source_modified_ms', source_modified_ms, 'content_hash', content_hash, " +
      "'title', title, 'opening_text', opening_text, 'body_blob_hash', body_blob_hash, 'content', content, " +
      "'indexed_at', indexed_at, 'is_present', is_present, 'missing_at', missing_at, 'created_at', created_at, " +
      "'updated_at', updated_at) AS payload_json FROM external_documents WHERE document_id = ? LIMIT 1"
  },
  syncPayloadExternalFolder: {
    syncPayload: { objectType: 'external_folder' },
    sql:
      "SELECT json_object('id', id, 'folder_path', folder_path, 'attachment_mode', attachment_mode, " +
      "'attachment_root_path', attachment_root_path, 'excluded_dirs_json', excluded_dirs_json, 'status', status, " +
      "'document_count', document_count, 'indexed_at', indexed_at, 'last_error', last_error, 'created_at', created_at, " +
      "'updated_at', updated_at) AS payload_json FROM external_search_folders WHERE id = ? LIMIT 1"
  },
  syncPayloadImportSource: {
    syncPayload: { objectType: 'import_source' },
    sql:
      "SELECT json_object('source_fingerprint', source_fingerprint, 'provider', provider, 'source_kind', source_kind, " +
      "'source_name', source_name, 'source_locator', source_locator, 'first_imported_at', first_imported_at, " +
      "'last_imported_at', last_imported_at, 'last_content_fingerprint', last_content_fingerprint, " +
      "'latest_node_id', latest_node_id) AS payload_json FROM import_sources WHERE source_fingerprint = ? LIMIT 1"
  },
  syncPayloadNodeReading: {
    syncPayload: { objectType: 'node_reading' },
    sql:
      "SELECT json_object('node_id', node_id, 'interval_duration_ms', interval_duration_ms, " +
      "'interval_growth_factor', interval_growth_factor, 'last_handled_at', last_handled_at, 'next_at', next_at, " +
      "'priority', priority, 'repetition_count', repetition_count, 'state', state) AS payload_json " +
      'FROM node_reading WHERE node_id = ? LIMIT 1'
  },
  syncPayloadNodeReview: {
    syncPayload: { objectType: 'node_review' },
    sql:
      "SELECT json_object('node_id', node_id, 'due', due, 'last_review_at', last_review_at, 'state', state, " +
      "'stability', stability, 'difficulty', difficulty, 'elapsed_days', elapsed_days, 'scheduled_days', scheduled_days, " +
      "'reps', reps, 'lapses', lapses) AS payload_json FROM node_review WHERE node_id = ? LIMIT 1"
  },
  syncPayloadPdfPageText: {
    syncPayload: { objectType: 'pdf_page_text' },
    sql:
      "SELECT json_object('attachment_id', attachment_id, 'page', page, 'text', text, " +
      "'page_width', page_width, 'page_height', page_height) AS payload_json " +
      "FROM pdf_page_text WHERE attachment_id || ':' || page = ? LIMIT 1"
  },
  syncPayloadSetting: {
    syncPayload: { objectType: 'setting' },
    sql:
      "SELECT json_object('key', key, 'scope', scope, 'platform', platform, 'form_factor', form_factor, " +
      "'device_id', device_id, 'value_json', value_json, 'content_hash', content_hash, 'updated_at', updated_at, " +
      "'deleted_at', deleted_at) AS payload_json FROM setting_records " +
      "WHERE scope || ':' || platform || ':' || form_factor || ':' || device_id || ':' || key = ? LIMIT 1"
  },
  syncPayloadViewActiveNode: {
    syncPayload: { objectIdKey: 'active_node', objectType: 'view_state' },
    sql:
      "SELECT json_object('active_node_id', NULLIF(value, '')) AS payload_json " +
      "FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1"
  },
  syncPayloadViewNodeState: {
    syncPayload: { objectIdPrefix: 'node:', objectType: 'view_state' },
    sql:
      "SELECT json_object('node_id', node_id, 'scroll_top', scroll_top, 'selection_from', NULL, " +
      "'selection_to', NULL, 'source', source) AS payload_json FROM node_view_state " +
      'WHERE node_id = ? AND device_id = ? LIMIT 1'
  }
};

export const ANDROID_COMPANION_QUERY_DEFINITIONS = {
  syncIndex: {
    resultKey: 'entries',
    sql:
      'SELECT object_type, object_id, current_version_id, content_hash, updated_at ' +
      "FROM sync_object_state WHERE object_type <> 'node' ORDER BY updated_at ASC, object_type ASC, object_id ASC",
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'sync_version_id', source: 'current_version_id', type: 'nullableString' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' }
    ]
  },
  syncStateChanges: {
    resultKey: 'objects',
    sql:
      'SELECT object_type, object_id, state_seq, content_hash, updated_at, deleted_at, base_content_hash ' +
      "FROM sync_object_state WHERE object_type <> 'node' AND sync_dirty = 1 AND state_seq > ? " +
      'AND NOT EXISTS (SELECT 1 FROM sync_push_ack ack WHERE ack.object_type = sync_object_state.object_type ' +
      'AND ack.object_id = sync_object_state.object_id) ORDER BY state_seq ASC LIMIT ?',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'state_seq', source: 'state_seq', type: 'long' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' },
      { key: 'base_content_hash', source: 'base_content_hash', type: 'nullableString' }
    ]
  },
  syncObjects: {
    resultKey: 'objects',
    sql:
      'SELECT object_type, object_id, content_hash, updated_at, deleted_at ' +
      "FROM sync_object_state WHERE object_type <> 'node' AND object_id IN (:objectIds):objectTypeFilter " +
      'ORDER BY updated_at ASC, object_type ASC, object_id ASC',
    columns: [
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'deleted_at', source: 'deleted_at', type: 'nullableString' }
    ]
  },
  nodeConflicts: {
    resultKey: 'conflicts',
    sql:
      'SELECT conflict_version_id, object_id, parent_version_id, device_id, ' +
      'content_hash, snapshot_json, detected_at FROM node_sync_conflicts ' +
      'ORDER BY detected_at DESC, conflict_version_id DESC',
    columns: [
      { key: 'conflict_version_id', source: 'conflict_version_id', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'parent_version_id', source: 'parent_version_id', type: 'nullableString' },
      { key: 'device_id', source: 'device_id', type: 'nullableString' },
      { key: 'content_hash', source: 'content_hash', type: 'nullableString' },
      { key: 'snapshot', source: 'snapshot_json', type: 'json' },
      { key: 'detected_at', source: 'detected_at', type: 'string' }
    ]
  },
  nodeAttachments: {
    resultKey: 'attachments',
    sql:
      'SELECT na.attachment_id, na.role, a.mime_type, a.original_name ' +
      'FROM node_attachments na LEFT JOIN attachments a ON a.id = na.attachment_id ' +
      'WHERE na.node_id = ? ORDER BY na.role ASC, na.attachment_id ASC',
    columns: [
      { key: 'attachmentId', source: 'attachment_id', type: 'string' },
      { key: 'role', source: 'role', type: 'string' },
      { key: 'mimeType', source: 'mime_type', type: 'nullableString' },
      { key: 'originalName', source: 'original_name', type: 'nullableString' }
    ]
  },
  syncPayloadAttachment: {
    sql:
      "SELECT json_object('attachment_id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, " +
      "'size_bytes', a.size_bytes, 'created_at', a.created_at, 'blob', json_object(" +
      "'content_hash', b.content_hash, 'storage_key', b.storage_key, 'size_bytes', b.size_bytes, " +
      "'mime_type', b.mime_type, 'availability', b.availability, 'source_device_id', b.source_device_id, " +
      "'created_at', b.created_at, 'cached_at', b.cached_at, 'last_verified_at', b.last_verified_at)) AS payload_json " +
      'FROM attachments a LEFT JOIN attachment_blobs b ON b.attachment_id = a.id WHERE a.id = ? LIMIT 1'
  },
  syncPayloadExternalDocument: {
    sql:
      "SELECT json_object('document_id', document_id, 'folder_id', folder_id, 'relative_path', relative_path, " +
      "'file_name', file_name, 'extension', extension, 'source_size_bytes', source_size_bytes, " +
      "'source_modified_at', source_modified_at, 'source_modified_ms', source_modified_ms, 'content_hash', content_hash, " +
      "'title', title, 'opening_text', opening_text, 'body_blob_hash', body_blob_hash, 'content', content, " +
      "'indexed_at', indexed_at, 'is_present', is_present, 'missing_at', missing_at, 'created_at', created_at, " +
      "'updated_at', updated_at) AS payload_json FROM external_documents WHERE document_id = ? LIMIT 1"
  },
  syncPayloadExternalFolder: {
    sql:
      "SELECT json_object('id', id, 'folder_path', folder_path, 'attachment_mode', attachment_mode, " +
      "'attachment_root_path', attachment_root_path, 'excluded_dirs_json', excluded_dirs_json, 'status', status, " +
      "'document_count', document_count, 'indexed_at', indexed_at, 'last_error', last_error, 'created_at', created_at, " +
      "'updated_at', updated_at) AS payload_json FROM external_search_folders WHERE id = ? LIMIT 1"
  },
  syncPayloadImportSource: {
    sql:
      "SELECT json_object('source_fingerprint', source_fingerprint, 'provider', provider, 'source_kind', source_kind, " +
      "'source_name', source_name, 'source_locator', source_locator, 'first_imported_at', first_imported_at, " +
      "'last_imported_at', last_imported_at, 'last_content_fingerprint', last_content_fingerprint, " +
      "'latest_node_id', latest_node_id) AS payload_json FROM import_sources WHERE source_fingerprint = ? LIMIT 1"
  },
  syncPayloadNodeReading: {
    sql:
      "SELECT json_object('node_id', node_id, 'interval_duration_ms', interval_duration_ms, " +
      "'interval_growth_factor', interval_growth_factor, 'last_handled_at', last_handled_at, 'next_at', next_at, " +
      "'priority', priority, 'repetition_count', repetition_count, 'state', state) AS payload_json " +
      'FROM node_reading WHERE node_id = ? LIMIT 1'
  },
  syncPayloadNodeReview: {
    sql:
      "SELECT json_object('node_id', node_id, 'due', due, 'last_review_at', last_review_at, 'state', state, " +
      "'stability', stability, 'difficulty', difficulty, 'elapsed_days', elapsed_days, 'scheduled_days', scheduled_days, " +
      "'reps', reps, 'lapses', lapses) AS payload_json FROM node_review WHERE node_id = ? LIMIT 1"
  },
  syncPayloadPdfPageText: {
    sql:
      "SELECT json_object('attachment_id', attachment_id, 'page', page, 'text', text, " +
      "'page_width', page_width, 'page_height', page_height) AS payload_json " +
      "FROM pdf_page_text WHERE attachment_id || ':' || page = ? LIMIT 1"
  },
  syncPayloadSetting: {
    sql:
      "SELECT json_object('key', key, 'scope', scope, 'platform', platform, 'form_factor', form_factor, " +
      "'device_id', device_id, 'value_json', value_json, 'content_hash', content_hash, 'updated_at', updated_at, " +
      "'deleted_at', deleted_at) AS payload_json FROM setting_records " +
      "WHERE scope || ':' || platform || ':' || form_factor || ':' || device_id || ':' || key = ? LIMIT 1"
  },
  syncPayloadViewActiveNode: {
    sql:
      "SELECT json_object('active_node_id', NULLIF(value, '')) AS payload_json " +
      "FROM workspace_meta WHERE key = 'active_node_id' LIMIT 1"
  },
  syncPayloadViewNodeState: {
    sql:
      "SELECT json_object('node_id', node_id, 'scroll_top', scroll_top, 'selection_from', NULL, " +
      "'selection_to', NULL, 'source', source) AS payload_json FROM node_view_state " +
      'WHERE node_id = ? AND device_id = ? LIMIT 1'
  },
  syncReviewLog: {
    resultKey: 'reviews',
    sql:
      'SELECT id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at, ' +
      'due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after ' +
      'FROM review_log WHERE device_id = ?:cursorFilter ORDER BY reviewed_at ASC, op_id ASC LIMIT ?',
    columns: [
      { key: 'id', source: 'id', type: 'string' },
      { key: 'op_id', source: 'op_id', type: 'string' },
      { key: 'device_id', source: 'device_id', type: 'string' },
      { key: 'node_id', source: 'node_id', type: 'string' },
      { key: 'grade', source: 'grade', type: 'long' },
      { key: 'scheduler_version', source: 'scheduler_version', type: 'string' },
      { key: 'reviewed_at', source: 'reviewed_at', type: 'string' },
      { key: 'due_before', source: 'due_before', type: 'string' },
      { key: 'stability_before', source: 'stability_before', type: 'double' },
      { key: 'difficulty_before', source: 'difficulty_before', type: 'double' },
      { key: 'due_after', source: 'due_after', type: 'string' },
      { key: 'stability_after', source: 'stability_after', type: 'double' },
      { key: 'difficulty_after', source: 'difficulty_after', type: 'double' }
    ]
  },
  syncNodeVersions: {
    resultKey: 'nodes',
    sql:
      "SELECT v.version_id, v.object_id, 'node' AS object_type, v.parent_version_id, v.device_id, " +
      "v.created_at AS version_created_at, COALESCE(json_extract(v.snapshot_json, '$.updated_at'), v.created_at) AS updated_at, " +
      'v.content_hash, v.snapshot_json AS snapshot FROM node_sync_versions v INNER JOIN nodes n ON n.id = v.object_id ' +
      "WHERE v.device_id = ?:cursorFilter AND v.object_id NOT LIKE 'conflict-copy-%' " +
      'AND n.current_version_id = v.version_id AND n.deleted_at IS NULL ORDER BY v.created_at ASC, v.version_id ASC LIMIT ?',
    columns: [
      { key: 'version_id', source: 'version_id', type: 'string' },
      { key: 'object_id', source: 'object_id', type: 'string' },
      { key: 'object_type', source: 'object_type', type: 'string' },
      { key: 'parent_version_id', source: 'parent_version_id', type: 'nullableString' },
      { key: 'device_id', source: 'device_id', type: 'string' },
      { key: 'version_created_at', source: 'version_created_at', type: 'string' },
      { key: 'updated_at', source: 'updated_at', type: 'string' },
      { key: 'content_hash', source: 'content_hash', type: 'string' },
      { key: 'snapshot', source: 'snapshot', type: 'json' }
    ]
  },
  syncNodeVersionParent: {
    sql: 'SELECT parent_version_id FROM node_sync_versions WHERE version_id = ? LIMIT 1'
  }
};

export const EXPECTED_SCHEMA_SOURCES = {
  androidAssetStatements: 60,
  androidJavaMigrationStatements: 0,
  desktopStatements: 85
};

export const EXPECTED_SHARED_SCHEMA_DRIFT = {
  attachment_blobs: [
    'indexes.idx_attachment_blobs_availability',
    'indexes.idx_attachment_blobs_content_hash',
    'createSql'
  ],
  attachments: [
    'columns.pdf_index_attempt',
    'columns.pdf_index_error',
    'columns.pdf_index_status',
    'columns.pdf_index_version',
    'columns.pdf_indexed_at',
    'createSql'
  ],
  content_blob_data: ['createSql'],
  external_documents: [
    'columns.title',
    'indexes.idx_external_documents_folder_relative',
    'indexes.idx_external_documents_hash',
    'indexes.idx_external_documents_present_updated',
    'createSql'
  ],
  import_sources: [
    'columns.watched_binding_id',
    'columns.watched_relative_path',
    'indexes.idx_import_sources_watched_relative',
    'createSql'
  ],
  node_sync_versions: ['indexes.idx_node_sync_versions_object_created'],
  node_view_state: ['createSql'],
  pdf_page_text: ['createSql'],
  setting_records: [
    'columns.device_id',
    'columns.form_factor',
    'columns.platform',
    'indexes.idx_setting_records_device',
    'indexes.idx_setting_records_lookup',
    'createSql'
  ],
  sync_change_log: [
    'indexes.idx_sync_change_log_created',
    'indexes.idx_sync_change_log_device_created',
    'indexes.idx_sync_change_log_object',
    'indexes.idx_sync_change_log_result_version'
  ],
  sync_object_state: [
    'indexes.idx_sync_object_state_dirty',
    'indexes.idx_sync_object_state_type_updated'
  ]
};

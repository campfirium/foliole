export const EXPECTED_SCHEMA_SOURCES = {
  androidAssetStatements: 72,
  androidJavaMigrationStatements: 0,
  desktopStatements: 89
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
    'indexes.idx_import_sources_location',
    'indexes.idx_import_sources_watched_relative'
  ],
  node_sync_versions: ['indexes.idx_node_sync_versions_object_created'],
  node_view_state: ['createSql'],
  pdf_page_text: ['createSql'],
  setting_records: [
    'columns.form_factor',
    'columns.host_name',
    'columns.platform',
    'createSql'
  ],
  sync_object_state: [
    'indexes.idx_sync_object_state_dirty',
    'indexes.idx_sync_object_state_type_updated'
  ]
};

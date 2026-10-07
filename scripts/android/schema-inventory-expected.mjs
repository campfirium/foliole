export const EXPECTED_SCHEMA_SOURCES = {
  androidAssetStatements: 219,
  androidJavaMigrationStatements: 0,
  desktopStatements: 179
};

export const EXPECTED_SHARED_SCHEMA_DRIFT = {
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
  node_view_state: ['createSql'],
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

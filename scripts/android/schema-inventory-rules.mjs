export const CORE_TABLES = [
  'attachments',
  'attachment_blobs',
  'content_blobs',
  'content_blob_data',
  'external_documents',
  'external_search_folders',
  'import_sources',
  'node_attachments',
  'node_order',
  'node_reading',
  'node_reading_host_state',
  'node_review',
  'node_sync_conflicts',
  'node_sync_version_parents',
  'node_sync_versions',
  'node_text_alternatives',
  'node_view_state',
  'nodes',
  'pdf_page_text',
  'review_log',
  'setting_records',
  'sync_change_log',
  'sync_delivery_receipts',
  'sync_object_state',
  'sync_peer_cursors',
  'workspace_meta'
];

export const DESKTOP_ONLY_TABLES = new Set([
  'external_folder_device_preferences',
  'import_runs',
  'incoming_updates',
  'keep_import_item_cache',
  'keep_import_items',
  'mirror_articles',
  'settings',
  'sync_peers'
]);

export const ANDROID_ONLY_TABLES = new Set(['companion_meta']);

const LEGACY_REPAIR_TABLES = new Set(['sync_object_state_next']);

const FIELD_CLASSIFICATIONS = new Map([
  ['attachments.columns.pdf_index_attempt', 'desktop-only-column'],
  ['attachments.columns.pdf_index_error', 'desktop-only-column'],
  ['attachments.columns.pdf_index_status', 'desktop-only-column'],
  ['attachments.columns.pdf_index_version', 'desktop-only-column'],
  ['attachments.columns.pdf_indexed_at', 'desktop-only-column'],
  ['attachments.createSql', 'desktop-only-column'],
  ['attachment_blobs.createSql', 'android-missing-constraint'],
  ['content_blob_data.createSql', 'android-missing-constraint'],
  ['external_documents.columns.title', 'android-missing-not-null'],
  ['external_documents.createSql', 'android-missing-not-null'],
  ['import_sources.columns.watched_binding_id', 'desktop-only-column'],
  ['import_sources.columns.watched_relative_path', 'desktop-only-column'],
  ['import_sources.createSql', 'desktop-only-column'],
  ['node_view_state.createSql', 'android-missing-constraint'],
  ['pdf_page_text.createSql', 'android-missing-constraint'],
  ['setting_records.columns.host_name', 'android-missing-default'],
  ['setting_records.columns.form_factor', 'android-missing-default'],
  ['setting_records.columns.platform', 'android-missing-default'],
  ['setting_records.createSql', 'android-missing-default']
]);

const MISSING_ANDROID_INDEX_FIELDS = [
  'attachment_blobs.indexes.idx_attachment_blobs_availability',
  'attachment_blobs.indexes.idx_attachment_blobs_content_hash',
  'external_documents.indexes.idx_external_documents_folder_relative',
  'external_documents.indexes.idx_external_documents_hash',
  'external_documents.indexes.idx_external_documents_present_updated',
  'import_sources.indexes.idx_import_sources_location',
  'import_sources.indexes.idx_import_sources_watched_relative',
  'node_sync_versions.indexes.idx_node_sync_versions_object_created',
  'sync_object_state.indexes.idx_sync_object_state_dirty',
  'sync_object_state.indexes.idx_sync_object_state_type_updated'
];

for (const field of MISSING_ANDROID_INDEX_FIELDS) {
  FIELD_CLASSIFICATIONS.set(field, 'android-missing-index');
}

export function classifyTableName(table, knownSet) {
  if (knownSet.has(table)) return 'known-platform-only';
  if (LEGACY_REPAIR_TABLES.has(table)) return 'legacy-repair';
  return 'unattributed';
}

export function classifyDifferenceField(qualified) {
  return FIELD_CLASSIFICATIONS.get(qualified) ?? 'unattributed';
}

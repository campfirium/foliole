export const CORE_TABLES = [
  'attachment_parse_queue',
  'attachment_pending',
  'content_blobs',
  'content_blob_data',
  'daily_flow_entries',
  'daily_flow_operations',
  'daily_flow_state',
  'external_documents',
  'external_search_folders',
  'import_sources',
  'node_reading',
  'node_reading_host_state',
  'node_review',
  'node_sync_conflicts',
  'node_sync_version_parents',
  'node_sync_versions',
  'node_text_alternatives',
  'node_view_state',
  'node_version_device_revisions',
  'node_version_local_holds',
  'node_version_local_origins',
  'node_version_local_proof_state',
  'node_version_local_source_revisions',
  'nodes',
  'parent_child_order',
  'parent_order_sources',
  'parent_order_writer',
  'parent_order_projection_pending',
  'pdf_index_state',
  'pdf_page_text',
  'pdf_text_artifact',
  'review_log',
  'setting_records',
  'sync_change_log',
  'sync_object_state',
  'sync_node_child_owners',
  'sync_group_restore_events',
  'sync_state_sequence',
  'workspace_meta'
];

export const DESKTOP_ONLY_TABLES = new Set([
  'external_folder_host_preferences',
  'import_runs',
  'incoming_updates',
  'keep_import_item_cache',
  'keep_import_items',
  'mirror_articles',
  'parent_child_order_members',
  'readwise_api_import_runs',
  'readwise_api_import_stage',
  'readwise_api_reconcile_runs',
  'readwise_api_reconcile_stage',
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
  'external_documents.indexes.idx_external_documents_folder_relative',
  'external_documents.indexes.idx_external_documents_hash',
  'external_documents.indexes.idx_external_documents_present_updated',
  'import_sources.indexes.idx_import_sources_location',
  'import_sources.indexes.idx_import_sources_watched_relative',
  'node_sync_versions.indexes.idx_node_sync_versions_object_created',
  'nodes.indexes.idx_nodes_current_version_id',
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

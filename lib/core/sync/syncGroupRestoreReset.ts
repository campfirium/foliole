import type { DbPort } from './dbPort.js';
import { clearRestoreWorkspaceSettings } from './syncGroupRestoreSettings.js';

// An explicit overwrite replaces library data while keeping ordinary device preferences.
// The caller commits this reset together with its durable clear-once progress marker.
const CLEAR_TABLES = [
  'daily_flow_projection_facts', 'daily_flow_lists', 'daily_flow_fact_rows',
  'daily_flow_sync_projection', 'daily_flow_sync_facts', 'daily_flow_operations', 'daily_flow_entries', 'daily_flow_state',
  'node_version_local_origins', 'node_version_local_holds',
  'node_version_device_revisions', 'node_version_local_source_revisions',
  'sync_push_ack', 'sync_change_log', 'node_text_alternatives', 'sync_node_child_owners',
  'node_sync_conflicts', 'node_sync_version_parents', 'node_sync_versions',
  'node_sync_tombstones', 'node_review', 'node_reading', 'node_open_state',
  'node_reading_host_state', 'node_view_state', 'review_log',
  'parent_order_projection_pending', 'parent_order_sources', 'parent_child_order', 'pdf_page_text', 'pdf_text_artifact', 'external_documents',
  'external_search_folders', 'external_folder_host_preferences', 'import_sources', 'watched_folder_bindings',
  'keep_import_items', 'keep_import_item_cache', 'watched_folder_conflict_decisions',
  'source_disposition_states', 'readwise_api_import_stage', 'readwise_api_import_runs',
  'readwise_api_reconcile_stage', 'readwise_api_reconcile_runs', 'import_runs', 'stored_import_locators',
  'sync_objects', 'sync_object_state', 'desktop_sources', 'content_blob_data', 'content_blobs',
  'pdf_index_state'
] as const;

export async function clearWorkgroupSyncDataForRestore(port: DbPort, restoreId: string) {
  if (!restoreId.trim()) throw new Error('sync_group_restore_id_invalid');
  const tableNames = new Set((await port.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  )).map((row) => row.name));
  const removedNodeIds = tableNames.has('nodes') ? (await port.query<{ id: string }>(
    `SELECT id FROM main.nodes WHERE id NOT IN ('special-inbox', 'special-virtual-root')`
  )).map((row) => row.id) : [];
  await port.run('PRAGMA defer_foreign_keys = ON');
  for (const table of CLEAR_TABLES) {
    if (!tableNames.has(table)) continue;
    if (table === 'sync_objects' || table === 'sync_object_state') {
      await port.run(`DELETE FROM main.${table} WHERE object_type != 'setting'`);
      continue;
    }
    await port.run(`DELETE FROM main.${table}`);
  }
  await clearRestoreWorkspaceSettings(port, tableNames);
  if (tableNames.has('nodes')) {
    await port.run(`DELETE FROM main.nodes
      WHERE id NOT IN ('special-inbox', 'special-virtual-root')`);
    await port.run(`UPDATE main.nodes SET current_version_id = NULL
      WHERE id IN ('special-inbox', 'special-virtual-root')`);
  }
  if (tableNames.has('workspace_meta')) {
    await port.run("DELETE FROM main.workspace_meta WHERE key = 'active_node_id'");
  }
  if (tableNames.has('node_version_local_proof_state')) {
    await port.run(`UPDATE main.node_version_local_proof_state
      SET library_epoch = ?, proof_revision = 0 WHERE singleton_id = 1`, [restoreId]);
  }
  if (tableNames.has('sync_state_sequence')) {
    await port.run('UPDATE main.sync_state_sequence SET source_epoch = ? WHERE singleton_id = 1', [restoreId]);
  }
  if (tableNames.has('settings')) {
    await port.run(`INSERT INTO main.settings (key, value, updated_at)
      VALUES ('workspace_search_source_identity', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [restoreId, new Date().toISOString()]);
  }
  return removedNodeIds;
}

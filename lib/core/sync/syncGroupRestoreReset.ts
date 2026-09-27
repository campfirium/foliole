import type { DbPort } from './dbPort.js';

// Materialized Sync Pack data is removed before the winning full pack is applied.
// The caller owns a transaction that covers both operations and the restore receipt.
const CLEAR_TABLES = [
  'node_version_outbound_payload_holds', 'node_version_outbound_holds',
  'node_version_local_holds', 'node_version_pack_receipts',
  'node_version_inbound_receipts', 'node_version_device_bases',
  'node_version_device_revisions', 'node_version_local_source_revisions',
  'sync_delivery_receipts', 'sync_push_ack', 'sync_peer_cursors',
  'sync_change_log', 'node_attachments', 'node_text_alternatives',
  'node_sync_conflicts', 'node_sync_version_parents', 'node_sync_versions',
  'node_sync_tombstones', 'node_review', 'node_reading', 'node_open_state',
  'node_reading_host_state', 'node_view_state', 'node_order', 'review_log',
  'parent_child_order', 'pdf_page_text', 'external_documents',
  'external_search_folders', 'import_sources', 'watched_folder_bindings',
  'sync_objects', 'sync_object_state', 'content_blob_data', 'content_blobs',
  'attachments'
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
    if (tableNames.has(table)) await port.run(`DELETE FROM main.${table}`);
  }
  if (tableNames.has('setting_records')) {
    if (tableNames.has('settings')) {
      await port.run(`DELETE FROM main.settings WHERE key IN
        (SELECT key FROM main.setting_records WHERE scope = 'user_space')`);
    }
    await port.run("DELETE FROM main.setting_records WHERE scope = 'user_space'");
  }
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
  if (tableNames.has('settings')) {
    await port.run(`INSERT INTO main.settings (key, value, updated_at)
      VALUES ('workspace_search_source_identity', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [restoreId, new Date().toISOString()]);
  }
  return removedNodeIds;
}

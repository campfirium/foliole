import { parseSyncGroupRestoreEvent, type SyncGroupRestoreEvent } from '../../platform/syncGroupRestoreContract.js';

import type { DbPort } from './dbPort.js';

// The caller commits publication and membership in the same transaction.
export async function publishSyncGroupRestoreEvent(port: DbPort, value: SyncGroupRestoreEvent) {
  const event = parseSyncGroupRestoreEvent(value);
  const tables = new Set((await port.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  )).map((row) => row.name));
  if (tables.has('sync_object_state')) {
    await port.run("DELETE FROM sync_object_state WHERE object_type IN ('node_position', 'parent_order_position')");
  }
  for (const table of [
    'node_version_outbound_payload_holds', 'node_version_outbound_holds',
    'node_version_local_holds', 'node_version_pack_receipts', 'node_version_confirmation_state',
    'node_version_inbound_receipts', 'node_version_device_bases', 'node_version_member_positions', 'parent_order_member_positions',
    'node_version_device_revisions', 'node_version_local_source_revisions',
    'sync_delivery_receipts', 'sync_push_ack', 'sync_peer_cursors',
    'sync_identity_receive_rounds', 'sync_identity_retired_views',
    'sync_identity_pack_receipts', 'sync_identity_peer_baselines',
    'sync_identity_fact_staging', 'sync_identity_fact_sections',
    'sync_pack_receive_progress', 'sync_pack_resource_articles', 'framed_sync_resource_demands',
    'sync_pack_dependency_rows', 'sync_pack_dependency_transfers', 'sync_pack_known_fact_claims'
  ]) {
    if (tables.has(table)) await port.run(`DELETE FROM ${table}`);
  }
  await port.run(`UPDATE node_version_local_proof_state SET library_epoch = ?, proof_revision = 0
    WHERE singleton_id = 1`, [event.restore_id]);
  if (tables.has('sync_state_sequence')) {
    await port.run('UPDATE sync_state_sequence SET source_epoch = ? WHERE singleton_id = 1', [event.restore_id]);
  }
  await port.run(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [event.restore_id, event.group_id, event.restored_at,
    event.source_device_identity_key, event.restored_at, event.restored_at]);
}

import {
  compareSyncGroupRestoreEvents,
  parseSyncGroupRestoreEvent,
  type SyncGroupRestoreEvent
} from '../../platform/syncGroupRestoreContract.js';

import type { DbPort } from './dbPort.js';

interface RestoreRow extends SyncGroupRestoreEvent {
  [key: string]: unknown;
  applied_at: string | null;
}

export async function loadLatestSyncGroupRestoreEvent(port: DbPort, groupId: string) {
  const [row] = await port.query<RestoreRow>(`SELECT group_id, restore_id, restored_at,
    source_device_identity_key, applied_at FROM sync_group_restore_events
    WHERE group_id = ? ORDER BY restored_at DESC, restore_id DESC LIMIT 1`, [groupId]);
  return row ? { event: parseSyncGroupRestoreEvent(row), applied: row.applied_at !== null } : null;
}

export async function receiveSyncGroupRestoreEvent(port: DbPort, incoming: SyncGroupRestoreEvent) {
  const event = parseSyncGroupRestoreEvent(incoming);
  const current = await loadLatestSyncGroupRestoreEvent(port, event.group_id);
  if (current && compareSyncGroupRestoreEvents(current.event, event) >= 0) return current;
  for (const table of ['sync_group_restore_page_rows', 'sync_pack_dependency_rows',
    'sync_pack_dependency_transfers', 'sync_pack_known_fact_claims',
    'sync_identity_receive_rounds', 'sync_identity_retired_views',
    'sync_identity_pack_receipts', 'sync_identity_peer_baselines']) {
    await port.run(`DELETE FROM ${table}`);
  }
  await port.run(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)`, [event.restore_id, event.group_id,
    event.restored_at, event.source_device_identity_key, new Date().toISOString()]);
  return { event, applied: false };
}

export async function markSyncGroupRestoreApplied(
  port: DbPort, event: SyncGroupRestoreEvent, appliedAt = new Date().toISOString()
) {
  const latest = await loadLatestSyncGroupRestoreEvent(port, event.group_id);
  if (!latest || latest.event.restore_id !== event.restore_id) {
    throw new Error('sync_group_restore_superseded');
  }
  await port.run(`UPDATE sync_group_restore_events SET applied_at = ?
    WHERE restore_id = ? AND applied_at IS NULL`, [appliedAt, event.restore_id]);
}

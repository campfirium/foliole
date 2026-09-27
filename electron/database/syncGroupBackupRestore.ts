import { randomUUID } from 'node:crypto';

import type { DatabaseBindValue, DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { SyncGroupRestoreEvent } from '../../lib/platform/syncGroupRestoreContract.js';

const GROUP_TABLES = [
  'sync_group_devices', 'sync_group_removal_decisions',
  'sync_group_removal_confirmations', 'sync_group_restore_events'
] as const;

type GroupSnapshot = {
  group: DatabaseRow;
  local: DatabaseRow;
  rows: Record<(typeof GROUP_TABLES)[number], DatabaseRow[]>;
};

export function captureCurrentSyncGroupForBackupRestore(driver: DatabaseDriver): GroupSnapshot | null {
  const local = driver.queryOne<DatabaseRow>(`SELECT * FROM sync_group_local_state
    WHERE singleton_id = 1 AND state = 'active'`);
  if (!local) return null;
  const groupId = String(local.group_id);
  const group = driver.queryOne<DatabaseRow>('SELECT * FROM sync_groups WHERE group_id = ?', [groupId]);
  if (!group) throw new Error('sync_group_restore_identity_missing');
  const rows = Object.fromEntries(GROUP_TABLES.map((table) => [table,
    driver.queryAll<DatabaseRow>(`SELECT * FROM ${table} WHERE group_id = ?`, [groupId])
  ])) as GroupSnapshot['rows'];
  return { group, local, rows };
}

export function finishSyncGroupBackupRestore(
  driver: DatabaseDriver, snapshot: GroupSnapshot | null,
  restoredAt = new Date().toISOString()
): SyncGroupRestoreEvent | null {
  if (!snapshot) return null;
  const event = {
    group_id: String(snapshot.group.group_id),
    restore_id: `restore-${randomUUID()}`,
    restored_at: restoredAt,
    source_device_identity_key: String(snapshot.local.local_device_identity_key)
  };
  driver.transaction((tx) => {
    tx.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(group_id) DO UPDATE SET
      display_name = excluded.display_name, workgroup_key = excluded.workgroup_key,
      created_at = excluded.created_at, updated_at = excluded.updated_at`,
    ['group_id', 'display_name', 'workgroup_key', 'created_at', 'updated_at']
      .map((key) => snapshot.group[key] as DatabaseBindValue));
    tx.execute('DELETE FROM sync_group_local_state');
    for (const table of [...GROUP_TABLES].reverse()) {
      tx.execute(`DELETE FROM ${table} WHERE group_id = ?`, [event.group_id]);
    }
    for (const table of GROUP_TABLES) {
      for (const row of snapshot.rows[table]) insertRow(tx, table, row);
    }
    insertRow(tx, 'sync_group_local_state', snapshot.local);
    resetSyncGeneration(tx, event.restore_id);
    tx.execute(`INSERT INTO sync_group_restore_events
      (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [event.restore_id, event.group_id,
      event.restored_at, event.source_device_identity_key, restoredAt, restoredAt]);
  });
  return event;
}

function insertRow(driver: DatabaseDriver, table: string, row: DatabaseRow) {
  const columns = Object.keys(row);
  driver.execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column] as DatabaseBindValue));
}

function resetSyncGeneration(driver: DatabaseDriver, restoreId: string) {
  for (const table of [
    'node_version_outbound_payload_holds', 'node_version_outbound_holds',
    'node_version_local_holds', 'node_version_pack_receipts',
    'node_version_inbound_receipts', 'node_version_device_bases',
    'node_version_device_revisions', 'node_version_local_source_revisions',
    'sync_delivery_receipts', 'sync_peer_cursors'
  ]) driver.execute(`DELETE FROM ${table}`);
  driver.execute(`UPDATE node_version_local_proof_state
    SET library_epoch = ?, proof_revision = 0 WHERE singleton_id = 1`, [restoreId]);
}

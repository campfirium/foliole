import { randomUUID } from 'node:crypto';

import type { DatabaseBindValue, DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { SyncGroupRestoreEvent } from '../../lib/platform/syncGroupRestoreContract.js';
import { APP_SETTINGS_STORAGE_KEYS } from '../../src/shared/config/appSettings.js';

import { readBackupRestoreLocalGroup } from './backupRestoreLocalGroup.js';
import { saveBackupRestorePendingSync } from './backupRestorePendingSync.js';
import { writeJsonSetting } from './settingsStore.js';

const GROUP_TABLES = [
  'sync_group_devices', 'sync_group_removal_decisions',
  'sync_group_removal_confirmations', 'sync_group_restore_events'
] as const;

export type GroupSnapshot = {
  group: DatabaseRow;
  local: DatabaseRow;
  hostSettings: DatabaseRow[];
  materializedHostSettings: DatabaseRow[];
  hostObjectStates: DatabaseRow[];
  rows: Record<(typeof GROUP_TABLES)[number], DatabaseRow[]>;
};

export function captureCurrentSyncGroupForBackupRestore(driver: DatabaseDriver): GroupSnapshot | null {
  const local = readBackupRestoreLocalGroup(driver);
  if (!local) return null;
  const groupId = String(local.group_id);
  const group = driver.queryOne<DatabaseRow>('SELECT * FROM sync_groups WHERE group_id = ?', [groupId]);
  if (!group) throw new Error('sync_group_restore_identity_missing');
  const rows = Object.fromEntries(GROUP_TABLES.map((table) => [table,
    driver.queryAll<DatabaseRow>(`SELECT * FROM ${table} WHERE group_id = ?`, [groupId])
  ])) as GroupSnapshot['rows'];
  return { group, local, rows, ...captureBackupRestoreHostSettings(driver) };
}

export function captureBackupRestoreHostSettings(driver: DatabaseDriver) {
  const hostSettings = driver.queryAll<DatabaseRow>("SELECT * FROM setting_records WHERE scope = 'host'");
  const materializedHostSettings = driver.queryAll<DatabaseRow>(`SELECT * FROM settings
    WHERE key IN (SELECT key FROM setting_records WHERE scope = 'host')
      OR key IN ('host_name', 'device_id', 'desktop_device_id')`);
  const hostObjectStates = driver.queryAll<DatabaseRow>(
    "SELECT * FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE 'host:%'");
  return { hostSettings, materializedHostSettings, hostObjectStates };
}

export function finishSyncGroupBackupRestore(
  driver: DatabaseDriver, snapshot: GroupSnapshot | null,
  restoredAt = new Date().toISOString(), mode: 'overwrite' | 'pause' = 'overwrite'
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
    applyBackupRestoreHostSettings(tx, snapshot);
    resetSyncGeneration(tx, event.restore_id);
    saveBackupRestorePendingSync(tx, mode === 'pause' ? { groupId: event.group_id,
      restoreId: event.restore_id, restoredAt } : null);
    writeRestoreSyncParticipation(tx, mode === 'pause', true);
    if (mode === 'overwrite') publishBackupRestoreEvent(tx, event);
  });
  return mode === 'overwrite' ? event : null;
}

function insertRow(driver: DatabaseDriver, table: string, row: DatabaseRow) {
  const columns = Object.keys(row);
  driver.execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column] as DatabaseBindValue));
}

export function resetSyncGeneration(driver: DatabaseDriver, restoreId: string) {
  for (const table of [
    'node_version_outbound_payload_holds', 'node_version_outbound_holds',
    'node_version_local_holds', 'node_version_pack_receipts', 'node_version_confirmation_state',
    'node_version_inbound_receipts', 'node_version_device_bases',
    'node_version_device_revisions', 'node_version_local_source_revisions',
    'sync_delivery_receipts', 'sync_peer_cursors',
    'sync_pack_receive_progress', 'sync_pack_resource_articles',
    'sync_pack_dependency_rows', 'sync_pack_dependency_transfers', 'sync_pack_known_fact_claims'
  ]) driver.execute(`DELETE FROM ${table}`);
  driver.execute(`UPDATE node_version_local_proof_state
    SET library_epoch = ?, proof_revision = 0 WHERE singleton_id = 1`, [restoreId]);
  driver.execute('UPDATE sync_state_sequence SET source_epoch = ? WHERE singleton_id = 1', [restoreId]);
}

export function writeRestoreSyncParticipation(driver: DatabaseDriver, paused: boolean, enabled: boolean) {
  const row = driver.queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'app_settings'");
  const settings = row ? JSON.parse(row.value) as Record<string, string> : {};
  settings[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncPaused] = String(paused);
  settings[APP_SETTINGS_STORAGE_KEYS.desktopDeviceSyncEnabled] = String(enabled);
  writeJsonSetting(driver, 'app_settings', settings);
}

export function publishBackupRestoreEvent(driver: DatabaseDriver, event: SyncGroupRestoreEvent) {
  resetSyncGeneration(driver, event.restore_id);
  driver.execute(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`, [event.restore_id, event.group_id,
    event.restored_at, event.source_device_identity_key, event.restored_at, event.restored_at]);
}

export function applyBackupRestoreHostSettings(tx: DatabaseDriver, snapshot: ReturnType<typeof captureBackupRestoreHostSettings>) {
  tx.execute("DELETE FROM settings WHERE key IN (SELECT key FROM setting_records WHERE scope = 'host')");
  tx.execute("DELETE FROM setting_records WHERE scope = 'host'");
  for (const row of snapshot.hostSettings) insertRow(tx, 'setting_records', row);
  for (const row of snapshot.materializedHostSettings) {
    tx.execute('DELETE FROM settings WHERE key = ?', [row.key as string]);
    insertRow(tx, 'settings', row);
  }
  tx.execute("DELETE FROM sync_object_state WHERE object_type = 'setting' AND object_id LIKE 'host:%'");
  for (const row of snapshot.hostObjectStates) insertRow(tx, 'sync_object_state', row);
}

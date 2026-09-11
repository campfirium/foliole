import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import type { SyncGroupLibraryFacts, SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import type { SyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

function owner() { return getIosCompanionDatabaseOwner(); }

export function loadCompanionSyncGroup() {
  return owner().read(loadGroup);
}

export function loadCompanionSyncGroupWorkgroupKey() {
  return owner().read(async (db) => {
    const row = (await db.query<DbRow>(
      `SELECT g.workgroup_key FROM sync_groups g JOIN sync_group_local_state l ON l.group_id = g.group_id
       WHERE l.singleton_id = 1 AND l.state = 'active' LIMIT 1`
    ))[0];
    return text(row?.workgroup_key);
  });
}

export function loadCompanionSyncGroupLibraryFacts(): Promise<SyncGroupLibraryFacts> {
  return owner().read(async (db) => ({
    attachment_count: await count(db, 'attachments'),
    content_blob_count: await count(db, 'content_blobs'),
    node_count: await count(db, 'nodes'),
    review_log_count: await count(db, 'review_log')
  }));
}

export function joinCompanionSyncGroup(args: {
  device: SyncGroupDeviceIdentity;
  deviceName: string;
  displayName: string;
  platform: string;
  provider: {
    device: SyncGroupDeviceIdentity;
    deviceName: string;
    platform: string;
  };
  workgroupKey: string;
}) {
  return owner().runWriter((db) => db.transaction(async (tx) => {
    if (await loadGroup(tx)) throw new Error('sync_group_identity_mismatch');
    const now = new Date().toISOString();
    await tx.run(
      `INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET display_name = excluded.display_name,
         workgroup_key = excluded.workgroup_key, updated_at = excluded.updated_at`,
      [args.device.group_id, args.displayName, args.workgroupKey, now, now]
    );
    await saveDevice(tx, args.device, args.deviceName, args.platform, now);
    if (args.provider.device.group_id !== args.device.group_id
        || args.provider.device.identity_key === args.device.identity_key) {
      throw new Error('sync_group_provider_identity_invalid');
    }
    await saveDevice(
      tx, args.provider.device, args.provider.deviceName, args.provider.platform, now
    );
    await tx.run(
      `INSERT INTO sync_group_local_state
       (singleton_id, group_id, local_device_identity_key, state, updated_at)
       VALUES (1, ?, ?, 'active', ?)`,
      [args.device.group_id, args.device.identity_key, now]
    );
    return (await loadGroup(tx))!;
  }));
}

export function leaveCompanionSyncGroupDevice() {
  return owner().runWriter((db) => db.transaction(async (tx) => {
    const group = await loadGroup(tx);
    if (!group) return;
    const now = new Date().toISOString();
    await tx.run(
      `UPDATE sync_group_devices SET state = 'left', left_at = ?, updated_at = ?
       WHERE group_id = ? AND device_identity_key = ?`,
      [now, now, group.group_id, group.local_device_identity_key]
    );
    await tx.run('DELETE FROM sync_group_local_state WHERE singleton_id = 1');
    await tx.run('DELETE FROM sync_delivery_receipts');
    await tx.run('DELETE FROM sync_peer_cursors');
    await tx.run('DELETE FROM sync_group_nonce_ledger');
  }));
}

async function loadGroup(db: DbPort): Promise<SyncGroupPayload | null> {
  const row = (await db.query<DbRow>(
    `SELECT g.group_id, g.display_name, g.created_at, l.local_device_identity_key
     FROM sync_groups g JOIN sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1 AND l.state = 'active' LIMIT 1`
  ))[0];
  if (!text(row?.group_id)) return null;
  const devices = await db.query<DbRow>(
    `SELECT device_identity_key, device_anchor, canonical_library_path, device_name,
            platform, state, joined_at, left_at, last_seen_at, updated_at
     FROM sync_group_devices WHERE group_id = ? AND state = 'active'
     ORDER BY joined_at, device_identity_key`, [String(row!.group_id)]
  );
  return {
    created_at: String(row!.created_at),
    devices: devices.map((device) => ({
      canonical_library_path: String(device.canonical_library_path), contract_version: 1,
      device_anchor: String(device.device_anchor), device_identity_key: String(device.device_identity_key),
      device_name: String(device.device_name), joined_at: String(device.joined_at),
      last_seen_at: text(device.last_seen_at), left_at: text(device.left_at),
      platform: String(device.platform), state: device.state === 'left' ? 'left' : 'active',
      updated_at: String(device.updated_at)
    })),
    display_name: String(row!.display_name),
    group_id: String(row!.group_id),
    local_device_identity_key: String(row!.local_device_identity_key)
  };
}

async function saveDevice(
  db: DbPort,
  device: SyncGroupDeviceIdentity,
  deviceName: string,
  platform: string,
  now: string
) {
  await db.run(
    `INSERT INTO sync_group_devices (
      group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
      platform, state, joined_at, left_at, last_seen_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
      device_name = excluded.device_name, platform = excluded.platform, state = 'active',
      left_at = NULL, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
    [device.group_id, device.identity_key, device.device_anchor, device.canonical_library_path,
      deviceName, platform, now, now, now]
  );
}

async function count(db: DbPort, table: string) {
  const row = (await db.query<DbRow>(`SELECT COUNT(*) AS value FROM ${table}`))[0];
  return Number(row?.value ?? 0);
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

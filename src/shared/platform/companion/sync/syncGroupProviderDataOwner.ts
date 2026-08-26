import type { PluginListenerHandle } from '@capacitor/core';

import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import {
  COMPANION_SYNC_GROUP_DATA_CONTRACT as CONTRACT,
  type CompanionSyncGroupDataRequest
} from '../../../../../lib/platform/companionSyncGroupDataContract';
import { createSyncGroupDeviceIdentity } from '../../../../../lib/platform/syncGroupUnifiedContract';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

let listenerReady: Promise<void> | null = null;

function dataPlugin() {
  return FolioleCompanionSync as typeof FolioleCompanionSync & {
    addListener(eventName: 'syncGroupDataRequest', listener: (event: CompanionSyncGroupDataRequest) => void):
      Promise<PluginListenerHandle>;
  };
}

export function ensureCompanionSyncGroupDataOwner() {
  listenerReady ??= dataPlugin().addListener(CONTRACT.eventName, (request) => {
    void handleRequest(request);
  }).then(() => undefined);
  return listenerReady;
}

async function handleRequest(request: CompanionSyncGroupDataRequest) {
  try {
    const result = await dispatch(request.operation, request.payload);
    await dataPlugin().resolveSyncGroupDataRequest({ request_id: request.request_id, result });
  } catch (error) {
    await dataPlugin().resolveSyncGroupDataRequest({
      error: error instanceof Error ? error.message : String(error), request_id: request.request_id
    });
  }
}

function dispatch(operation: string, payload: Record<string, unknown>) {
  if (operation === CONTRACT.operations.createSnapshot) return createSnapshot(payload);
  if (operation === CONTRACT.operations.loadCurrentCredential) return loadCurrentCredential(payload);
  if (operation === CONTRACT.operations.loadGroup) return loadGroupPayload();
  if (operation === CONTRACT.operations.registerDevice) return registerDevice(payload);
  if (operation === CONTRACT.operations.verifyDevice) return verifyDevice(payload);
  if (operation === CONTRACT.operations.recordSupplyCursor) return recordSupplyCursor(payload);
  if (operation === CONTRACT.operations.saveSyncEndpoint) return saveSyncEndpoint(payload);
  throw new Error('sync_group_data_operation_unsupported');
}

async function loadGroupPayload() {
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const group = (await db.query<DbRow>(
      `SELECT g.group_id, g.display_name, g.created_at, l.local_device_identity_key
       FROM sync_groups g JOIN sync_group_local_state l ON l.group_id = g.group_id
       WHERE l.singleton_id = 1 AND l.state = 'active' LIMIT 1`
    ))[0];
    if (!group) throw new Error('sync_group_not_available');
    const devices = await db.query<DbRow>(
      `SELECT device_identity_key, device_anchor, canonical_library_path, device_name,
              platform, state, joined_at, left_at, last_seen_at, updated_at
       FROM sync_group_devices WHERE group_id = ? ORDER BY joined_at, device_identity_key`,
      [requiredText(group.group_id)]
    );
    return { devices, group };
  });
}

async function loadCurrentCredential(payload: Record<string, unknown>) {
  const groupId = requiredText(payload.group_id);
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const rows = await db.query<DbRow>(
      `SELECT l.local_device_identity_key AS device_id, g.workgroup_key
       FROM sync_group_local_state l JOIN sync_groups g ON g.group_id = l.group_id
       JOIN sync_group_devices d ON d.group_id = l.group_id
         AND d.device_identity_key = l.local_device_identity_key
       WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active'
         AND l.group_id = ? LIMIT 2`, [groupId]
    );
    const row = rows[0];
    if (rows.length !== 1 || !row) throw new Error('sync_group_current_credential_missing');
    return { device_id: requiredText(row.device_id), workgroup_key: requiredText(row.workgroup_key) };
  });
}

async function registerDevice(payload: Record<string, unknown>) {
  const groupId = requiredText(payload.group_id);
  const device = requiredObject(payload.device);
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: requiredText(device.device_anchor), group_id: groupId,
    library_path: requiredText(device.canonical_library_path),
    path_flavor: device.path_flavor === 'windows' ? 'windows' : 'posix'
  });
  if (identity.identity_key !== requiredText(device.device_identity_key)) {
    throw new Error('sync_group_device_identity_mismatch');
  }
  const now = new Date().toISOString();
  return writer(async (db) => {
    await db.run(
      `INSERT INTO sync_group_devices (
        group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
        platform, state, joined_at, left_at, last_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
      ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
        device_name = excluded.device_name, platform = excluded.platform, state = 'active',
        left_at = NULL, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
      [groupId, identity.identity_key, identity.device_anchor, identity.canonical_library_path,
        requiredText(device.device_name), requiredText(device.platform), now, now, now]
    );
    return { device_id: identity.identity_key, registered: true };
  });
}

async function verifyDevice(payload: Record<string, unknown>) {
  const groupId = requiredText(payload.group_id);
  const deviceId = requiredText(payload.device_id);
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const row = (await db.query<DbRow>(
      `SELECT device_name FROM sync_group_devices
       WHERE group_id = ? AND device_identity_key = ? AND state = 'active' LIMIT 1`,
      [groupId, deviceId]
    ))[0];
    return { active: Boolean(row), ...(row ? { device_name: requiredText(row.device_name) } : {}) };
  });
}

async function createSnapshot(payload: Record<string, unknown>) {
  const targetPath = requiredText(payload.target_path);
  if (!targetPath.includes('/cache/foliole-provider-source-')) throw new Error('sync_group_snapshot_path_invalid');
  const sqlPath = targetPath.replaceAll("'", "''");
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(
    (db) => db.run(`VACUUM INTO '${sqlPath}'`).then(() => undefined)
  ));
  return { snapshot_path: targetPath };
}

function recordSupplyCursor(payload: Record<string, unknown>) {
  return writer(async (db) => {
    await db.run(
      `INSERT OR REPLACE INTO sync_peer_cursors
       (peer_id, stream_name, cursor_value, updated_at) VALUES (?, 'sync-pack-supply', ?, ?)`,
      [requiredText(payload.peer_id), `${requiredNumber(payload.from_cursor)}:${requiredNumber(payload.to_cursor)}`,
        new Date().toISOString()]
    );
    return { recorded: true };
  });
}

function saveSyncEndpoint(payload: Record<string, unknown>) {
  return writer(async (db) => {
    await db.run(
      `INSERT OR REPLACE INTO companion_meta (key, value, updated_at)
       VALUES ('workspace_sync_endpoint_url', ?, ?)`,
      [requiredText(payload.endpoint_url), requiredText(payload.updated_at)]
    );
    return { saved: true };
  });
}

function writer<T>(task: (db: DbPort) => Promise<T>) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(task));
}

function requiredText(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_text_required');
  return value.trim();
}

function requiredNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('sync_group_data_number_required');
  return value;
}

function requiredObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('sync_group_data_object_required');
  return value as Record<string, unknown>;
}

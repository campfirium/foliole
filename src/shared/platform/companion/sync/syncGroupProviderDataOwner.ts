import type { PluginListenerHandle } from '@capacitor/core';

import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import {
  COMPANION_SYNC_GROUP_DATA_CONTRACT as CONTRACT,
  type CompanionSyncGroupDataRequest
} from '../../../../../lib/platform/companionSyncGroupDataContract';
import { allocateSyncGroupDeviceProfile } from '../../../../../lib/platform/syncGroupDeviceProfile';
import {
  runCompanionSyncControlWriterTask,
  runCompanionSyncWriterTask
} from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

let listenerReady: Promise<void> | null = null;

const dataPlugin = FolioleCompanionSync as typeof FolioleCompanionSync & {
  addListener(
    eventName: 'syncGroupDataRequest',
    listener: (event: CompanionSyncGroupDataRequest) => void
  ): Promise<PluginListenerHandle>;
};

export function ensureCompanionSyncGroupDataOwner() {
  listenerReady ??= dataPlugin.addListener(CONTRACT.eventName, (request) => {
    void handleRequest(request);
  }).then(() => undefined);
  return listenerReady;
}

async function handleRequest(request: CompanionSyncGroupDataRequest) {
  try {
    const result = await dispatch(request.operation, request.payload);
    await FolioleCompanionSync.resolveSyncGroupDataRequest({ request_id: request.request_id, result });
  } catch (error) {
    await FolioleCompanionSync.resolveSyncGroupDataRequest({
      error: error instanceof Error ? error.message : String(error), request_id: request.request_id
    });
  }
}

async function dispatch(operation: string, payload: Record<string, unknown>) {
  if (operation === CONTRACT.operations.authorizeMember) return authorizeMember(payload);
  if (operation === CONTRACT.operations.createSnapshot) return createSnapshot(payload);
  if (operation === CONTRACT.operations.loadGroup) return loadGroupPayload();
  if (operation === CONTRACT.operations.recordDeparture) return recordDeparture(payload);
  if (operation === CONTRACT.operations.recordSupplyCursor) return recordSupplyCursor(payload);
  if (operation === CONTRACT.operations.saveSyncEndpoint) return saveSyncEndpoint(payload);
  throw new Error('sync_group_data_operation_unsupported');
}

async function authorizeMember(payload: Record<string, unknown>) {
  const groupId = text(payload.group_id);
  const deviceId = text(payload.device_id);
  const owner = getIosCompanionDatabaseOwner();
  const member = record(payload.member);
  if (!member) {
    const active = await owner.read((db) => hasActiveMember(db, groupId, deviceId));
    return { authorized: active, ...(active ? { device_id: deviceId, device_name: deviceId } : {}) };
  }
  return runCompanionSyncControlWriterTask(() => owner.runWriter((db) => db.transaction(async (tx) => {
    const authorizationId = text(member.authorization_id);
    const existing = (await tx.query<DbRow>(
      `SELECT device_id, device_name FROM sync_group_members
       WHERE group_id = ? AND authorization_id = ? LIMIT 1`, [groupId, authorizationId]
    ))[0];
    if (existing) return { authorized: true, device_id: text(existing.device_id), device_name: text(existing.device_name) };
    const occupied = await tx.query<DbRow>(
      'SELECT device_name FROM sync_group_members WHERE group_id = ?', [groupId]
    );
    const assigned = allocateSyncGroupDeviceProfile(
      text(member.device_name), occupied.map((row) => text(row.device_name))
    );
    const now = new Date().toISOString();
    await tx.run(
      `INSERT INTO sync_group_members (
        group_id, device_id, device_kind, device_name, state, approved_by_device_id,
        authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)`,
      [groupId, assigned.device_id, text(member.device_kind), assigned.device_name,
        text(payload.approved_by_device_id), authorizationId, text(member.joined_at), now]
    );
    return { authorized: true, ...assigned };
  })));
}

async function createSnapshot(payload: Record<string, unknown>) {
  const targetPath = text(payload.target_path);
  if (!targetPath.includes('/cache/foliole-provider-source-')) throw new Error('sync_group_snapshot_path_invalid');
  const sqlPath = targetPath.replaceAll("'", "''");
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(
    (db) => db.run(`VACUUM INTO '${sqlPath}'`).then(() => undefined)
  ));
  return { snapshot_path: targetPath };
}

async function loadGroupPayload() {
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const group = (await db.query<DbRow>(
      'SELECT group_id, display_name, timeline_id, created_by_device_id, created_at FROM sync_groups LIMIT 1'
    ))[0];
    if (!group) throw new Error('sync_group_not_available');
    const members = await db.query<DbRow>(
      `SELECT device_id, device_kind, device_name, state, approved_by_device_id,
              authorization_id, joined_at FROM sync_group_members
       WHERE state = 'active' ORDER BY joined_at, device_id`
    );
    return { group, members };
  });
}

async function recordDeparture(payload: Record<string, unknown>) {
  const value = record(payload.value);
  if (!value) throw new Error('sync_group_departure_authorization_invalid');
  const groupId = text(payload.group_id);
  const deviceId = text(value.device_id);
  if (groupId !== text(value.group_id) || deviceId !== text(value.authorized_by_device_id)) {
    throw new Error('sync_group_departure_authorization_invalid');
  }
  return writer(async (db) => {
    const row = (await db.query<DbRow>(
      `SELECT joined_at FROM sync_group_members
       WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1`, [groupId, deviceId]
    ))[0];
    const leftAt = text(value.left_at);
    if (!row || !validDepartureTime(leftAt, text(row.joined_at))) {
      throw new Error('sync_group_departure_authorization_invalid');
    }
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT OR IGNORE INTO sync_group_member_departures
         (group_id, device_id, authorized_by_device_id, authorization_id, left_at) VALUES (?, ?, ?, ?, ?)`,
        [groupId, deviceId, deviceId, text(value.authorization_id), leftAt]
      );
      await tx.run(
        `UPDATE sync_group_members SET state = 'left', left_at = ?, updated_at = ?
         WHERE group_id = ? AND device_id = ?`, [leftAt, leftAt, groupId, deviceId]
      );
    });
    return { recorded: true };
  });
}

function recordSupplyCursor(payload: Record<string, unknown>) {
  return writer(async (db) => {
    await db.run(
      `INSERT OR REPLACE INTO sync_peer_cursors
       (peer_id, stream_name, cursor_value, updated_at) VALUES (?, 'sync-pack-supply', ?, ?)`,
      [text(payload.peer_id), `${number(payload.from_cursor)}:${number(payload.to_cursor)}`, new Date().toISOString()]
    );
    return { recorded: true };
  });
}

function saveSyncEndpoint(payload: Record<string, unknown>) {
  return writer(async (db) => {
    await db.run(
      `INSERT OR REPLACE INTO companion_meta (key, value, updated_at)
       VALUES ('workspace_sync_endpoint_url', ?, ?)`, [text(payload.endpoint_url), text(payload.updated_at)]
    );
    return { saved: true };
  });
}

function writer<T>(task: (db: DbPort) => Promise<T>) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(task));
}

async function hasActiveMember(db: DbPort, groupId: string, deviceId: string) {
  const rows = await db.query(
    `SELECT 1 FROM sync_group_members WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1`,
    [groupId, deviceId]
  );
  return rows.length > 0;
}

function validDepartureTime(leftAt: string, joinedAt: string) {
  const left = Date.parse(leftAt);
  const joined = Date.parse(joinedAt);
  return Number.isFinite(left) && Number.isFinite(joined) && left >= joined;
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_data_payload_invalid');
  return value;
}

function number(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('sync_group_data_payload_invalid');
  return value;
}

import type { PluginListenerHandle } from '@capacitor/core';

import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import {
  COMPANION_SYNC_GROUP_DATA_CONTRACT as CONTRACT,
  type CompanionSyncGroupDataRequest
} from '../../../../../lib/platform/companionSyncGroupDataContract';
import { allocateSyncGroupHostName } from '../../../../../lib/platform/syncGroupDeviceProfile';
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
  if (operation === CONTRACT.operations.loadCurrentCredential) return loadCurrentCredential(payload);
  if (operation === CONTRACT.operations.loadGroup) return loadGroupPayload();
  if (operation === CONTRACT.operations.recordDeparture) return recordDeparture(payload);
  if (operation === CONTRACT.operations.recordSupplyCursor) return recordSupplyCursor(payload);
  if (operation === CONTRACT.operations.saveSyncEndpoint) return saveSyncEndpoint(payload);
  throw new Error('sync_group_data_operation_unsupported');
}

async function authorizeMember(payload: Record<string, unknown>) {
  const groupId = text(payload.group_id);
  const owner = getIosCompanionDatabaseOwner();
  const member = record(payload.member);
  if (!member) {
    const authorizationId = optionalText(payload.authorization_id);
    if (authorizationId) {
      const row = await owner.read(async (db) => (await db.query<DbRow>(
        `SELECT host_name FROM sync_group_members
         WHERE group_id = ? AND authorization_id = ? AND state = 'active' LIMIT 1`,
        [groupId, authorizationId]
      ))[0]);
      return { authorized: Boolean(row), ...(row ? { host_name: text(row.host_name) } : {}) };
    }
    const hostName = text(payload.host_name);
    const active = await owner.read((db) => hasActiveMember(db, groupId, hostName));
    return { authorized: active, ...(active ? { host_name: hostName } : {}) };
  }
  return runCompanionSyncControlWriterTask(() => owner.runWriter((db) => db.transaction(async (tx) => {
    return authorizeNewMember(tx, groupId, member, payload);
  })));
}

async function authorizeNewMember(
  tx: DbPort, groupId: string, member: Record<string, unknown>, payload: Record<string, unknown>
) {
  const authorizationId = text(member.authorization_id);
  const existing = (await tx.query<DbRow>(`SELECT host_name FROM sync_group_members
    WHERE group_id = ? AND authorization_id = ? LIMIT 1`, [groupId, authorizationId]))[0];
  if (existing) return { authorized: true, host_name: text(existing.host_name) };
  const occupied = await tx.query<DbRow>(`SELECT host_name FROM sync_group_members
    WHERE group_id = ? AND state = 'active'`, [groupId]);
  const assigned = allocateSyncGroupHostName(text(member.host_name), occupied.map((row) => text(row.host_name)));
  const joinedAt = text(member.joined_at);
  const now = new Date().toISOString();
  await tx.run(`INSERT INTO sync_group_members (
    group_id, host_name, host_platform, state, approved_by_host_name,
    authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
  ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)
  ON CONFLICT(group_id, host_name) DO UPDATE SET host_platform = excluded.host_platform,
    state = 'active', approved_by_host_name = excluded.approved_by_host_name,
    authorization_id = excluded.authorization_id, provisioning_cursor = NULL,
    joined_at = excluded.joined_at, activated_at = NULL, left_at = NULL, updated_at = excluded.updated_at
  WHERE sync_group_members.state = 'left' AND excluded.joined_at > sync_group_members.joined_at`,
  [groupId, assigned.host_name, text(member.host_platform), text(payload.approved_by_host_name),
    authorizationId, joinedAt, now]);
  await tx.run(`DELETE FROM sync_group_member_departures
    WHERE group_id = ? AND host_name = ? AND left_at < ?`, [groupId, assigned.host_name, joinedAt]);
  return { authorized: true, ...assigned };
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
      'SELECT group_id, display_name, timeline_id, created_by_host_name, created_at FROM sync_groups LIMIT 1'
    ))[0];
    if (!group) throw new Error('sync_group_not_available');
    const members = await db.query<DbRow>(
      `SELECT host_name, host_platform, state, approved_by_host_name,
              authorization_id, joined_at FROM sync_group_members
       WHERE state = 'active' ORDER BY joined_at, host_name`
    );
    return { group, members };
  });
}

async function loadCurrentCredential(payload: Record<string, unknown>) {
  const groupId = text(payload.group_id);
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const rows = await db.query<DbRow>(
      `SELECT member.authorization_id, groups.workgroup_key
       FROM sync_group_local_state local
       JOIN sync_groups groups ON groups.group_id = local.group_id
       JOIN sync_group_members member ON member.group_id = local.group_id
         AND member.host_name = local.local_host_name
       WHERE local.singleton_id = 1 AND local.member_state = 'active'
         AND member.state = 'active' AND local.group_id = ? LIMIT 2`, [groupId]
    );
    const row = rows[0];
    if (rows.length !== 1 || !row) throw new Error('sync_group_current_credential_missing');
    return { authorization_id: text(row.authorization_id), workgroup_key: text(row.workgroup_key) };
  });
}

async function recordDeparture(payload: Record<string, unknown>) {
  const value = record(payload.value);
  if (!value) throw new Error('sync_group_departure_authorization_invalid');
  const groupId = text(payload.group_id);
  const hostName = text(value.host_name);
  if (groupId !== text(value.group_id) || hostName !== text(value.authorized_by_host_name)) {
    throw new Error('sync_group_departure_authorization_invalid');
  }
  return writer(async (db) => {
    const row = (await db.query<DbRow>(
      `SELECT joined_at FROM sync_group_members
       WHERE group_id = ? AND host_name = ? AND state = 'active' LIMIT 1`, [groupId, hostName]
    ))[0];
    const leftAt = text(value.left_at);
    if (!row || !validDepartureTime(leftAt, text(row.joined_at))) {
      throw new Error('sync_group_departure_authorization_invalid');
    }
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO sync_group_member_departures
         (group_id, host_name, authorized_by_host_name, authorization_id, left_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(group_id, host_name) DO UPDATE SET
           authorized_by_host_name = excluded.authorized_by_host_name,
           authorization_id = excluded.authorization_id,
           left_at = excluded.left_at
         WHERE excluded.left_at > sync_group_member_departures.left_at`,
        [groupId, hostName, hostName, text(value.authorization_id), leftAt]
      );
      await tx.run(
        `UPDATE sync_group_members SET state = 'left', left_at = ?, updated_at = ?
         WHERE group_id = ? AND host_name = ?`, [leftAt, leftAt, groupId, hostName]
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

async function hasActiveMember(db: DbPort, groupId: string, hostName: string) {
  const rows = await db.query(
    `SELECT 1 FROM sync_group_members WHERE group_id = ? AND host_name = ? AND state = 'active' LIMIT 1`,
    [groupId, hostName]
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

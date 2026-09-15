import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import type { SyncGroupDevicePayload } from '../../../../../lib/platform/syncGroupContract';
import type {
  SyncGroupMemberStatePayload,
  SyncGroupRemovalDecisionPayload
} from '../../../../../lib/platform/syncGroupMemberStateContract';
import { SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION } from '../../../../../lib/platform/syncGroupMemberStateContract';
import {
  createSyncGroupDeviceIdentity,
  devicePathFlavorFromCanonicalLibraryPath
} from '../../../../../lib/platform/syncGroupUnifiedContract';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

type Context = { groupId: string; localDeviceId: string };

export function loadCompanionSyncGroupMemberState() {
  return getIosCompanionDatabaseOwner().read(async (db) => {
    const context = await loadContext(db);
    if (!context) throw new Error('sync_group_not_available');
    return loadState(db, context);
  });
}

export function applyCompanionSyncGroupMemberState(
  incoming: SyncGroupMemberStatePayload,
  authenticatedDeviceId: string
) {
  return runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter(
    (db) => db.transaction(async (tx) => {
      const context = await loadContext(tx);
      if (!context || incoming.group_id !== context.groupId ||
          incoming.sender_device_identity_key !== authenticatedDeviceId) {
        throw new Error('sync_group_member_state_identity_mismatch');
      }
      for (const removal of incoming.removals) await mergeRemoval(tx, incoming.group_id, removal);
      for (const device of incoming.devices) await mergeDevice(tx, incoming.group_id, device, context.localDeviceId);
      const now = new Date().toISOString();
      let localExited = false;
      for (const removal of await loadRemovals(tx, incoming.group_id)) {
        if (removal.superseded_at || removal.completed_at) continue;
        const targetsLocal = removal.target_device_identity_key === context.localDeviceId;
        await persistRemovalConfirmation(tx, incoming.group_id, removal.decision_id, context.localDeviceId,
          targetsLocal ? 'target_exit' : 'enforced', now);
        await tx.run('DELETE FROM sync_delivery_receipts WHERE peer_id = ?',
          [removal.target_device_identity_key]);
        await tx.run('DELETE FROM sync_peer_cursors WHERE peer_id = ?',
          [removal.target_device_identity_key]);
        if (targetsLocal) {
          await persistLocalExit(tx, context, now);
          localExited = true;
        }
      }
      await completeEligibleRemovals(tx, context, now);
      return { local_exited: localExited, state: await loadState(tx, context) };
    })
  ));
}

export async function isCompanionSyncGroupDeviceBlocked(groupId: string, deviceId: string) {
  return getIosCompanionDatabaseOwner().read(async (db) => Boolean((await db.query<DbRow>(
    `SELECT 1 AS blocked FROM sync_group_removal_decisions
     WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NULL LIMIT 1`,
    [groupId, deviceId]
  ))[0]));
}

async function loadContext(db: DbPort): Promise<Context | null> {
  const row = (await db.query<DbRow>(`SELECT group_id, local_device_identity_key
    FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'`))[0];
  return row ? { groupId: String(row.group_id), localDeviceId: String(row.local_device_identity_key) } : null;
}

async function loadState(db: DbPort, context: Context): Promise<SyncGroupMemberStatePayload> {
  return {
    contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION,
    devices: await loadDevices(db, context.groupId),
    group_id: context.groupId,
    removals: await loadRemovals(db, context.groupId),
    sender_device_identity_key: context.localDeviceId
  };
}

async function loadDevices(db: DbPort, groupId: string): Promise<SyncGroupDevicePayload[]> {
  const rows = await db.query<DbRow>(`SELECT canonical_library_path, device_anchor,
    device_identity_key, device_name, joined_at, last_seen_at, left_at, platform, state, updated_at
    FROM sync_group_devices WHERE group_id = ? ORDER BY joined_at, device_identity_key`, [groupId]);
  return rows.map((row) => ({ ...row, contract_version: 1 } as unknown as SyncGroupDevicePayload));
}

async function loadRemovals(db: DbPort, groupId: string): Promise<SyncGroupRemovalDecisionPayload[]> {
  const rows = await db.query<DbRow>(`SELECT decision_id, target_device_identity_key,
    initiated_by_device_identity_key, created_at, completed_at, superseded_at
    FROM sync_group_removal_decisions WHERE group_id = ? ORDER BY created_at, decision_id`, [groupId]);
  return Promise.all(rows.map(async (row) => ({ ...row, confirmations: await db.query<DbRow>(
    `SELECT confirming_device_identity_key, kind, confirmed_at
     FROM sync_group_removal_confirmations WHERE group_id = ? AND decision_id = ?
     ORDER BY confirming_device_identity_key`, [groupId, String(row.decision_id)]
  ) } as unknown as SyncGroupRemovalDecisionPayload)));
}

async function mergeRemoval(db: DbPort, groupId: string, removal: SyncGroupRemovalDecisionPayload) {
  if (!removal || typeof removal.decision_id !== 'string' ||
      typeof removal.target_device_identity_key !== 'string' ||
      typeof removal.initiated_by_device_identity_key !== 'string' || !Array.isArray(removal.confirmations)) {
    throw new Error('sync_group_member_state_invalid');
  }
  await db.run(`INSERT INTO sync_group_removal_decisions
    (group_id, decision_id, target_device_identity_key, initiated_by_device_identity_key,
     created_at, completed_at, superseded_at) VALUES (?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(group_id, decision_id) DO UPDATE SET
      superseded_at = COALESCE(sync_group_removal_decisions.superseded_at, excluded.superseded_at)`,
  [groupId, removal.decision_id, removal.target_device_identity_key,
    removal.initiated_by_device_identity_key, removal.created_at, removal.superseded_at]);
  const saved = (await db.query<DbRow>(`SELECT target_device_identity_key, initiated_by_device_identity_key
    FROM sync_group_removal_decisions WHERE group_id = ? AND decision_id = ?`,
  [groupId, removal.decision_id]))[0];
  if (saved?.target_device_identity_key !== removal.target_device_identity_key ||
      saved.initiated_by_device_identity_key !== removal.initiated_by_device_identity_key) {
    throw new Error('sync_group_removal_decision_mismatch');
  }
  for (const item of removal.confirmations) {
    await persistRemovalConfirmation(db, groupId, removal.decision_id, item.confirming_device_identity_key,
      item.kind, item.confirmed_at);
  }
}

async function mergeDevice(db: DbPort, groupId: string, device: SyncGroupDevicePayload, localId: string) {
  if (!device || device.contract_version !== 1 || typeof device.device_identity_key !== 'string') {
    throw new Error('sync_group_member_state_invalid');
  }
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: device.device_anchor, group_id: groupId,
    library_path: device.canonical_library_path,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(device.canonical_library_path)
  });
  if (identity.identity_key !== device.device_identity_key) {
    throw new Error('sync_group_device_identity_mismatch');
  }
  const existing = (await db.query<DbRow>(`SELECT device_anchor, canonical_library_path, state
    FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?`,
  [groupId, device.device_identity_key]))[0];
  if (existing && (existing.device_anchor !== device.device_anchor ||
      existing.canonical_library_path !== device.canonical_library_path)) {
    throw new Error('sync_group_device_identity_mismatch');
  }
  const deviceBlocked = await hasActiveRemoval(db, groupId, device.device_identity_key);
  const removalSuperseded = await hasSupersededRemoval(db, groupId, device.device_identity_key);
  const canRevive = device.state === 'active' && removalSuperseded && !deviceBlocked;
  const state = device.device_identity_key === localId ? 'active'
    : existing?.state === 'left' && !canRevive ? 'left' : device.state;
  await db.run(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
    canonical_library_path, device_name, platform, state, joined_at, left_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
      device_name = excluded.device_name, platform = excluded.platform, state = excluded.state,
      left_at = COALESCE(sync_group_devices.left_at, excluded.left_at),
      last_seen_at = COALESCE(excluded.last_seen_at, sync_group_devices.last_seen_at)`,
  [groupId, device.device_identity_key, device.device_anchor, device.canonical_library_path,
    device.device_name, device.platform, state, device.joined_at, device.left_at,
    device.last_seen_at, device.updated_at]);
}

async function persistRemovalConfirmation(db: DbPort, groupId: string, decisionId: string, deviceId: string,
  kind: 'enforced' | 'target_exit', confirmedAt: string) {
  await db.run(`INSERT OR IGNORE INTO sync_group_removal_confirmations
    (group_id, decision_id, confirming_device_identity_key, kind, confirmed_at) VALUES (?, ?, ?, ?, ?)`,
  [groupId, decisionId, deviceId, kind, confirmedAt]);
}

async function completeEligibleRemovals(db: DbPort, context: Context, now: string) {
  const devices = await loadDevices(db, context.groupId);
  for (const removal of await loadRemovals(db, context.groupId)) {
    if (removal.completed_at || removal.superseded_at) continue;
    const targetConfirmed = removal.confirmations.some((item) => item.kind === 'target_exit' &&
      item.confirming_device_identity_key === removal.target_device_identity_key);
    const activeOthers = devices.filter((device) => device.state === 'active' &&
      device.device_identity_key !== removal.target_device_identity_key);
    const allConfirmed = removal.initiated_by_device_identity_key === context.localDeviceId &&
      activeOthers.every((device) => removal.confirmations.some((item) =>
        item.confirming_device_identity_key === device.device_identity_key));
    if (!targetConfirmed && !allConfirmed) continue;
    await db.run(`UPDATE sync_group_removal_decisions SET completed_at = ?
      WHERE group_id = ? AND decision_id = ? AND completed_at IS NULL`,
    [now, context.groupId, removal.decision_id]);
    await db.run(`UPDATE sync_group_devices SET state = 'left', left_at = COALESCE(left_at, ?), updated_at = ?
      WHERE group_id = ? AND device_identity_key = ?`,
    [now, now, context.groupId, removal.target_device_identity_key]);
  }
}

async function persistLocalExit(db: DbPort, context: Context, now: string) {
  await db.run(`UPDATE sync_group_devices SET state = 'left', left_at = ?, updated_at = ?
    WHERE group_id = ? AND device_identity_key = ?`, [now, now, context.groupId, context.localDeviceId]);
  await db.run('DELETE FROM sync_group_local_state WHERE singleton_id = 1');
  await db.run('DELETE FROM sync_delivery_receipts');
  await db.run('DELETE FROM sync_peer_cursors');
  await db.run('DELETE FROM sync_group_nonce_ledger');
}

async function hasActiveRemoval(db: DbPort, groupId: string, deviceId: string) {
  return Boolean((await db.query<DbRow>(`SELECT 1 AS value FROM sync_group_removal_decisions
    WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NULL LIMIT 1`,
  [groupId, deviceId]))[0]);
}

async function hasSupersededRemoval(db: DbPort, groupId: string, deviceId: string) {
  return Boolean((await db.query<DbRow>(`SELECT 1 AS value FROM sync_group_removal_decisions
    WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NOT NULL LIMIT 1`,
  [groupId, deviceId]))[0]);
}

import { randomUUID } from 'node:crypto';

import type { SyncGroupDevicePayload } from '../../lib/platform/syncGroupContract.js';
import type {
  SyncGroupMemberStatePayload,
  SyncGroupRemovalDecisionPayload
} from '../../lib/platform/syncGroupMemberStateContract.js';
import { SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION } from '../../lib/platform/syncGroupMemberStateContract.js';
import {
  createSyncGroupDeviceIdentity,
  devicePathFlavorFromCanonicalLibraryPath
} from '../../lib/platform/syncGroupUnifiedContract.js';

import { openDatabaseConnection } from './connection.js';
import { leaveDesktopSyncGroupDevice } from './syncGroupStore.js';
import {
  applyWatchedFolderGroupMemberState,
  loadWatchedFolderGroupMemberState
} from './watchedFolderGroupMemberState.js';

type Row = Record<string, null | number | string>;

export function loadDesktopSyncGroupMemberState(args?: {
  groupId?: string;
  senderDeviceId?: string;
}): SyncGroupMemberStatePayload {
  const driver = openDatabaseConnection().driver;
  const context = args?.groupId && args.senderDeviceId
    ? { group_id: args.groupId, local_device_identity_key: args.senderDeviceId }
    : driver.queryOne<Row>(`SELECT group_id, local_device_identity_key
        FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'`);
  if (!context) throw new Error('sync_group_not_available');
  return {
    contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION,
    devices: loadDevices(String(context.group_id)),
    group_id: String(context.group_id),
    removals: loadRemovals(String(context.group_id)),
    sender_device_identity_key: String(context.local_device_identity_key),
    ...loadWatchedFolderGroupMemberState()
  };
}

export function initiateDesktopSyncGroupDeviceRemoval(targetDeviceId: string, now = new Date().toISOString()) {
  const state = loadDesktopSyncGroupMemberState();
  if (targetDeviceId === state.sender_device_identity_key ||
      !state.devices.some((device) => device.device_identity_key === targetDeviceId && device.state === 'active')) {
    throw new Error('sync_group_remove_target_invalid');
  }
  const driver = openDatabaseConnection().driver;
  const existing = driver.queryOne<Row>(`SELECT decision_id FROM sync_group_removal_decisions
    WHERE group_id = ? AND target_device_identity_key = ? AND completed_at IS NULL AND superseded_at IS NULL
    ORDER BY created_at LIMIT 1`, [state.group_id, targetDeviceId]);
  const decisionId = existing ? String(existing.decision_id) : `removal-${randomUUID()}`;
  driver.transaction(() => {
    if (!existing) driver.execute(`INSERT INTO sync_group_removal_decisions
      (group_id, decision_id, target_device_identity_key, initiated_by_device_identity_key,
       created_at, completed_at, superseded_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    [state.group_id, decisionId, targetDeviceId, state.sender_device_identity_key, now]);
    confirm(state.group_id, decisionId, state.sender_device_identity_key, 'enforced', now);
    driver.execute('DELETE FROM sync_delivery_receipts WHERE peer_id = ?', [targetDeviceId]);
    driver.execute('DELETE FROM sync_peer_cursors WHERE peer_id = ?', [targetDeviceId]);
    completeEligibleRemovals(state.group_id, state.sender_device_identity_key, now);
  });
  return decisionId;
}

export function applyDesktopSyncGroupMemberState(
  incoming: SyncGroupMemberStatePayload,
  authenticatedDeviceId: string,
  now = new Date().toISOString()
) {
  const local = loadDesktopSyncGroupMemberState();
  if (incoming.group_id !== local.group_id || incoming.sender_device_identity_key !== authenticatedDeviceId) {
    throw new Error('sync_group_member_state_identity_mismatch');
  }
  const driver = openDatabaseConnection().driver;
  let localExited = false;
  driver.transaction(() => {
    for (const removal of incoming.removals) mergeRemoval(incoming.group_id, removal);
    for (const device of incoming.devices) mergeDevice(incoming.group_id, device, local.sender_device_identity_key);
    applyWatchedFolderGroupMemberState(incoming, authenticatedDeviceId);
    for (const removal of loadRemovals(incoming.group_id)) {
      if (removal.superseded_at || removal.completed_at) continue;
      const targetsLocal = removal.target_device_identity_key === local.sender_device_identity_key;
      confirm(incoming.group_id, removal.decision_id, local.sender_device_identity_key,
        targetsLocal ? 'target_exit' : 'enforced', now);
      driver.execute('DELETE FROM sync_delivery_receipts WHERE peer_id = ?',
        [removal.target_device_identity_key]);
      driver.execute('DELETE FROM sync_peer_cursors WHERE peer_id = ?',
        [removal.target_device_identity_key]);
      if (targetsLocal) {
        leaveDesktopSyncGroupDevice(local.sender_device_identity_key, now);
        localExited = true;
      }
    }
    completeEligibleRemovals(incoming.group_id, local.sender_device_identity_key, now);
  });
  return {
    localExited,
    state: loadDesktopSyncGroupMemberState({
      groupId: incoming.group_id,
      senderDeviceId: local.sender_device_identity_key
    })
  };
}

export function loadPendingDesktopSyncGroupRemovalDeviceIds(groupId: string) {
  return openDatabaseConnection().driver.queryAll<Row>(`SELECT target_device_identity_key
    FROM sync_group_removal_decisions
    WHERE group_id = ? AND completed_at IS NULL AND superseded_at IS NULL`, [groupId])
    .map((row) => String(row.target_device_identity_key));
}

export function isDesktopSyncGroupDeviceBlocked(groupId: string, deviceId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne<Row>(`SELECT 1 AS blocked
    FROM sync_group_removal_decisions
    WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NULL LIMIT 1`,
  [groupId, deviceId]));
}

function loadDevices(groupId: string): SyncGroupDevicePayload[] {
  return openDatabaseConnection().driver.queryAll<Row>(`SELECT canonical_library_path, device_anchor,
    device_identity_key, device_name, joined_at, last_seen_at, left_at, platform, state, updated_at
    FROM sync_group_devices WHERE group_id = ? ORDER BY joined_at, device_identity_key`, [groupId])
    .map((row) => ({ ...row, contract_version: 1 } as unknown as SyncGroupDevicePayload));
}

function loadRemovals(groupId: string): SyncGroupRemovalDecisionPayload[] {
  const driver = openDatabaseConnection().driver;
  return driver.queryAll<Row>(`SELECT decision_id, target_device_identity_key,
    initiated_by_device_identity_key, created_at, completed_at, superseded_at
    FROM sync_group_removal_decisions WHERE group_id = ? ORDER BY created_at, decision_id`, [groupId])
    .map((row) => ({
      ...row,
      confirmations: driver.queryAll<Row>(`SELECT confirming_device_identity_key, kind, confirmed_at
        FROM sync_group_removal_confirmations WHERE group_id = ? AND decision_id = ?
        ORDER BY confirming_device_identity_key`, [groupId, String(row.decision_id)])
    } as unknown as SyncGroupRemovalDecisionPayload));
}

function mergeRemoval(groupId: string, removal: SyncGroupRemovalDecisionPayload) {
  if (!removal || typeof removal.decision_id !== 'string' ||
      typeof removal.target_device_identity_key !== 'string' ||
      typeof removal.initiated_by_device_identity_key !== 'string' || !Array.isArray(removal.confirmations)) {
    throw new Error('sync_group_member_state_invalid');
  }
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_group_removal_decisions
    (group_id, decision_id, target_device_identity_key, initiated_by_device_identity_key,
     created_at, completed_at, superseded_at) VALUES (?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(group_id, decision_id) DO UPDATE SET
      superseded_at = COALESCE(sync_group_removal_decisions.superseded_at, excluded.superseded_at)`,
  [groupId, removal.decision_id, removal.target_device_identity_key,
    removal.initiated_by_device_identity_key, removal.created_at, removal.superseded_at]);
  const saved = driver.queryOne<Row>(`SELECT target_device_identity_key, initiated_by_device_identity_key
    FROM sync_group_removal_decisions WHERE group_id = ? AND decision_id = ?`, [groupId, removal.decision_id]);
  if (saved?.target_device_identity_key !== removal.target_device_identity_key ||
      saved.initiated_by_device_identity_key !== removal.initiated_by_device_identity_key) {
    throw new Error('sync_group_removal_decision_mismatch');
  }
  for (const confirmation of removal.confirmations) confirm(groupId, removal.decision_id,
    confirmation.confirming_device_identity_key, confirmation.kind, confirmation.confirmed_at);
}

function mergeDevice(groupId: string, device: SyncGroupDevicePayload, localDeviceId: string) {
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
  const driver = openDatabaseConnection().driver;
  const existing = driver.queryOne<Row>(`SELECT device_anchor, canonical_library_path, state
    FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?`, [groupId, device.device_identity_key]);
  if (existing && (existing.device_anchor !== device.device_anchor ||
      existing.canonical_library_path !== device.canonical_library_path)) {
    throw new Error('sync_group_device_identity_mismatch');
  }
  const canRevive = device.state === 'active' && hasSupersededRemoval(groupId, device.device_identity_key)
    && !isDesktopSyncGroupDeviceBlocked(groupId, device.device_identity_key);
  const state = device.device_identity_key === localDeviceId ? 'active'
    : existing?.state === 'left' && !canRevive ? 'left' : device.state;
  driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
    canonical_library_path, device_name, platform, state, joined_at, left_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
      device_name = excluded.device_name, platform = excluded.platform,
      state = excluded.state,
      left_at = COALESCE(sync_group_devices.left_at, excluded.left_at),
      last_seen_at = COALESCE(excluded.last_seen_at, sync_group_devices.last_seen_at)`,
  [groupId, device.device_identity_key, device.device_anchor, device.canonical_library_path,
    device.device_name, device.platform, state, device.joined_at, device.left_at,
    device.last_seen_at, device.updated_at]);
}

function hasSupersededRemoval(groupId: string, deviceId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne<Row>(`SELECT 1 AS value
    FROM sync_group_removal_decisions
    WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NOT NULL LIMIT 1`,
  [groupId, deviceId]));
}

function confirm(groupId: string, decisionId: string, deviceId: string,
  kind: 'enforced' | 'target_exit', confirmedAt: string) {
  openDatabaseConnection().driver.execute(`INSERT OR IGNORE INTO sync_group_removal_confirmations
    (group_id, decision_id, confirming_device_identity_key, kind, confirmed_at) VALUES (?, ?, ?, ?, ?)`,
  [groupId, decisionId, deviceId, kind, confirmedAt]);
}

function completeEligibleRemovals(groupId: string, localDeviceId: string, now: string) {
  const driver = openDatabaseConnection().driver;
  for (const removal of loadRemovals(groupId)) {
    if (removal.completed_at || removal.superseded_at) continue;
    const targetConfirmed = removal.confirmations.some((item) => item.kind === 'target_exit' &&
      item.confirming_device_identity_key === removal.target_device_identity_key);
    const activeOthers = loadDevices(groupId).filter((device) => device.state === 'active' &&
      device.device_identity_key !== removal.target_device_identity_key);
    const allCurrentConfirmed = removal.initiated_by_device_identity_key === localDeviceId &&
      activeOthers.every((device) => removal.confirmations.some((item) =>
        item.confirming_device_identity_key === device.device_identity_key));
    if (!targetConfirmed && !allCurrentConfirmed) continue;
    driver.execute(`UPDATE sync_group_removal_decisions SET completed_at = ?
      WHERE group_id = ? AND decision_id = ? AND completed_at IS NULL`, [now, groupId, removal.decision_id]);
    driver.execute(`UPDATE sync_group_devices SET state = 'left', left_at = COALESCE(left_at, ?), updated_at = ?
      WHERE group_id = ? AND device_identity_key = ?`,
    [now, now, groupId, removal.target_device_identity_key]);
  }
}

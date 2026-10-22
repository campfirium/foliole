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
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { openDatabaseConnection } from './connection.js';
import {
  loadDesktopLocalNodeProof
} from './nodeVersionPeerProof.js';
import { loadDesktopSyncGroupCoverage, mergeDesktopSyncGroupCoverage } from './syncGroupCoverageDesktop.js';
import { applyDesktopSyncGroupAdoptionPeerProof, loadDesktopCompletedAdoptionSource, loadDesktopSyncGroupLocalAdoption, saveDesktopSyncGroupPeerAdoption } from './syncGroupLocalAdoptionStore.js';
import { loadDevices, loadRemovals, completeEligibleRemovals } from './syncGroupMemberStateReads.js';
import {
  loadDesktopSyncGroupRestoreState,
  receiveDesktopSyncGroupRestoreState,
  syncGroupRestorePeersReady
} from './syncGroupRestoreState.js';
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
  const proof = loadDesktopLocalNodeProof();
  const adoption = loadDesktopSyncGroupLocalAdoption(driver);
  const adoptedFrom = !adoption && loadDesktopCompletedAdoptionSource(driver, String(context.group_id), proof.library_epoch);
  return {
    contract_version: SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION,
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    ...(adoption ? { adopting_from: adoption.providerDeviceId } : {}),
    ...(adoptedFrom ? { adopted_from: adoptedFrom } : {}),
    ...(adoption ? {} : { coverage: loadDesktopSyncGroupCoverage(driver, String(context.group_id)) }),
    devices: loadDevices(String(context.group_id)),
    group_id: String(context.group_id),
    library_epoch: proof.library_epoch,
    proof_revision: proof.proof_revision,
    source_proof_revisions: proof.source_proof_revisions,
    removals: loadRemovals(String(context.group_id)),
    restore: adoption ? null : loadDesktopSyncGroupRestoreState(driver, String(context.group_id)),
    sender_device_identity_key: String(context.local_device_identity_key),
    ...(adoption ? {} : loadWatchedFolderGroupMemberState())
  };
}

// Removal coordinates membership across the user's trusted devices. It does not
// rotate the shared key or promise isolation from a device retaining that key.
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


    completeEligibleRemovals(state.group_id, now);
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
  let normalSyncReady = false;
  driver.transaction(() => {
    saveDesktopSyncGroupPeerAdoption(driver, local, incoming, now);
    const localRestore = receiveDesktopSyncGroupRestoreState(driver, incoming.group_id, incoming.restore);
    normalSyncReady = local.adopting_from
      ? local.adopting_from === authenticatedDeviceId && !incoming.adopting_from && incoming.restore?.applied !== false
      : incoming.adopting_from === local.sender_device_identity_key || syncGroupRestorePeersReady(localRestore, incoming.restore);
    if (!normalSyncReady) {
      if (localRestore?.applied && localRestore.event.source_device_identity_key === local.sender_device_identity_key &&
          incoming.restore?.event.restore_id === localRestore.event.restore_id) {
        const receiver = incoming.devices.find((device) =>
          device.device_identity_key === authenticatedDeviceId && device.state === 'active');
        if (receiver) mergeDevice(incoming.group_id, receiver, local.sender_device_identity_key);
      }
      return;
    }
    applyDesktopSyncGroupAdoptionPeerProof(incoming, local);
    if (!local.adopting_from) mergeDesktopSyncGroupCoverage(driver, incoming.group_id, incoming.coverage);
    for (const removal of incoming.removals) mergeRemoval(incoming.group_id, removal);
    for (const device of incoming.devices) mergeDevice(incoming.group_id, device, local.sender_device_identity_key, incoming.removals);
    if (!local.adopting_from) applyWatchedFolderGroupMemberState(incoming, authenticatedDeviceId);
    for (const removal of loadRemovals(incoming.group_id)) {
      if (removal.superseded_at) continue;
      const targetsLocal = removal.target_device_identity_key === local.sender_device_identity_key;
      confirm(incoming.group_id, removal.decision_id, local.sender_device_identity_key,
        targetsLocal ? 'target_exit' : 'enforced', now);


      if (targetsLocal) {
        leaveDesktopSyncGroupDevice(local.sender_device_identity_key, now);
        localExited = true;
      }
    }
    completeEligibleRemovals(incoming.group_id, now);
  });
  return {
    localExited,
    normalSyncReady,
    state: loadDesktopSyncGroupMemberState({
      groupId: incoming.group_id,
      senderDeviceId: local.sender_device_identity_key
    })
  };
}

export function isDesktopSyncGroupDeviceBlocked(groupId: string, deviceId: string) {
  return Boolean(openDatabaseConnection().driver.queryOne<Row>(`SELECT 1 AS blocked
    FROM sync_group_removal_decisions
    WHERE group_id = ? AND target_device_identity_key = ? AND superseded_at IS NULL LIMIT 1`,
  [groupId, deviceId]));
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

function mergeDevice(groupId: string, device: SyncGroupDevicePayload, localDeviceId: string,
  incomingRemovals: SyncGroupRemovalDecisionPayload[] = []) {
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
  const existing = driver.queryOne<Pick<SyncGroupDevicePayload,
    'device_anchor' | 'canonical_library_path' | 'state' | 'device_name' | 'platform' | 'updated_at'>>(`SELECT device_anchor, canonical_library_path, state,
    device_name, platform, updated_at
    FROM sync_group_devices WHERE group_id = ? AND device_identity_key = ?`, [groupId, device.device_identity_key]);
  if (existing && (existing.device_anchor !== device.device_anchor ||
      existing.canonical_library_path !== device.canonical_library_path)) {
    throw new Error('sync_group_device_identity_mismatch');
  }
  const blocked = isDesktopSyncGroupDeviceBlocked(groupId, device.device_identity_key);
  const canRevive = device.state === 'active' && hasSupersededRemoval(groupId, device.device_identity_key) && !blocked;
  const staleRemoval = !blocked && incomingRemovals.some(removal => !removal.superseded_at &&
    removal.target_device_identity_key === device.device_identity_key);
  const state = device.device_identity_key === localDeviceId ? 'active'
    : existing?.state === 'active' && staleRemoval ? 'active'
    : existing?.state === 'left' && !canRevive ? 'left' : device.state;
  const keepMetadata = existing && (device.device_identity_key === localDeviceId ||
    device.updated_at <= existing.updated_at);
  driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
    canonical_library_path, device_name, platform, state, joined_at, left_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, device_identity_key) DO UPDATE SET
      device_name = excluded.device_name, platform = excluded.platform, updated_at = excluded.updated_at,
      state = excluded.state,
      left_at = CASE WHEN excluded.state = 'active' THEN NULL
        ELSE COALESCE(sync_group_devices.left_at, excluded.left_at) END,
      last_seen_at = COALESCE(excluded.last_seen_at, sync_group_devices.last_seen_at)`,
  [groupId, device.device_identity_key, device.device_anchor, device.canonical_library_path,
    keepMetadata ? existing.device_name : device.device_name,
    keepMetadata ? existing.platform : device.platform, state, device.joined_at, device.left_at,
    device.last_seen_at, keepMetadata ? existing.updated_at : device.updated_at]);
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

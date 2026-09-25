import { randomUUID } from 'node:crypto';

import { isDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from '../database/readwiseOwnerGuard.js';
import { loadReadwiseSourceModeState } from '../database/readwiseSourceMode.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { createDesktopWorkgroupPost, readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { loadDesktopSyncGroupMemberEndpoints } from './desktopSyncGroupMemberStateSession.js';
import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadReadwiseHandoffIntent, saveReadwiseHandoffIntent,
  type ReadwiseHandoffIntent } from './readwiseHandoffIntent.js';
import { handleReadwiseOwnerStop, READWISE_OWNER_STOP_PATH,
  resumeReadwiseExecutionAfterActivation, type ReadwiseStopRequest } from './readwiseOwnerStop.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

const STOP_WAIT_MS = 30_000;
let activeHandoff: { intent: ReadwiseHandoffIntent;
  promise: Promise<ReturnType<typeof loadReadwiseHostAssignment>> } | null = null;

function resumePreparedActivation() {
  const current = snapshot();
  if (!current.group) return null;
  const localId = current.group.local_device_identity_key;
  const guard = loadReadwiseOwnerGuard(current.group.group_id);
  if (!guard || guard.state !== 'active' || guard.ownerId !== localId ||
      guard.mode !== current.mode || guard.epoch !== current.assignment.active_owner_epoch + 1) return null;
  const selectionSource = loadReadwiseHandoffIntent(current.group.group_id)?.selectionSource ?? 'chosen';
  saveJsonSetting('readwise_active_host', { device_identity_key: localId,
    epoch: guard.epoch, host_name: current.assignment.current_host_name,
    selection_source: selectionSource });
  resumeReadwiseExecutionAfterActivation();
  return loadReadwiseHostAssignment();
}

function stopTargets(groupId: string, localId: string, ownerId: string | null) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== groupId) throw new Error('readwise_group_changed');
  const desktopIds = group.devices.filter((device) => device.state === 'active' &&
    isDesktopSyncGroupPlatform(device.platform)).map((device) => device.device_identity_key);
  if (!desktopIds.includes(localId)) throw new Error('readwise_local_member_inactive');
  if (ownerId && ownerId !== localId) return [ownerId];
  if (ownerId === localId) return [localId];
  return desktopIds.sort();
}

function snapshot() {
  const group = loadDesktopSyncGroup();
  const assignment = loadReadwiseHostAssignment();
  const sourceMode = loadReadwiseSourceModeState();
  if (!group) return { assignment, dbPath: openDatabaseConnection().dbPath,
    group: null, mode: sourceMode.mode };
  if (sourceMode.conflictReasons.length || sourceMode.mode === 'off') {
    throw new Error('readwise_local_connection_unavailable');
  }
  return { assignment, dbPath: openDatabaseConnection().dbPath, group, mode: sourceMode.mode };
}

async function requestRemoteStop(peer: DesktopSyncGroupPeer, request: ReadwiseStopRequest) {
  const encrypted = await runWithDatabaseConnectionOwner(() => {
    const key = loadDesktopWorkgroupKey(request.groupId);
    if (!key) throw new Error('readwise_group_key_missing');
    return createDesktopWorkgroupPost({ body: JSON.stringify(request), groupId: request.groupId,
      localDeviceId: request.targetId, pathWithQuery: READWISE_OWNER_STOP_PATH,
      secret: key.group_key });
  });
  let response: Response;
  try {
    response = await fetch(`${peer.endpoint_url}${READWISE_OWNER_STOP_PATH}`, {
      body: encrypted.body, headers: encrypted.headers, method: 'POST',
      signal: AbortSignal.timeout(5_000)
    });
  } catch { throw new Error('readwise_member_unreachable'); }
  const body = await readDesktopWorkgroupResponse({ contentType: 'application/json; charset=utf-8',
    groupId: request.groupId, method: 'POST', pathWithQuery: READWISE_OWNER_STOP_PATH, response });
  return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
}

function validStopAck(value: Record<string, unknown>, request: ReadwiseStopRequest, deviceId: string) {
  return value.status === 'stopped' && value.groupId === request.groupId &&
    value.mode === request.mode && value.epoch === request.epoch &&
    value.ownerId === request.ownerId && value.requestId === request.requestId &&
    value.targetId === request.targetId && value.oldDeviceId === deviceId;
}

async function waitForStop(deviceId: string, peer: DesktopSyncGroupPeer | null,
  request: ReadwiseStopRequest) {
  if (peer) {
    await assertDesktopSyncGroupPeerCompatible(peer);
    const membership = await exchangeDesktopSyncGroupMemberState(peer);
    if (membership.localExited || membership.peerBlocked) throw new Error('readwise_member_unavailable');
  }
  const deadline = Date.now() + STOP_WAIT_MS;
  while (Date.now() < deadline) {
    const response = peer
      ? await requestRemoteStop(peer, request)
      : await runWithDatabaseConnectionOwner(() => handleReadwiseOwnerStop(JSON.stringify(request), request.targetId));
    if (validStopAck(response, request, deviceId)) return;
    if (response.status !== 'pending' || response.requestId !== request.requestId) {
      throw new Error('readwise_stop_ack_invalid');
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('readwise_stop_pending_retry');
}

function currentIntent(): ReadwiseHandoffIntent | null {
  const group = loadDesktopSyncGroup();
  return group ? loadReadwiseHandoffIntent(group.group_id) : null;
}

function pendingResult(error: unknown) {
  return error instanceof Error && ['readwise_member_unreachable',
    'readwise_stop_pending_retry'].includes(error.message);
}

function sameIntent(left: ReadwiseHandoffIntent, right: ReadwiseHandoffIntent) {
  return left.dbPath === right.dbPath && left.groupId === right.groupId &&
    left.mode === right.mode &&
    left.ownerId === right.ownerId && left.epoch === right.epoch &&
    left.targetId === right.targetId && left.selectionSource === right.selectionSource &&
    left.forceCurrent === right.forceCurrent;
}

async function runHandoff(intent: ReadwiseHandoffIntent) {
  try {
    const result = await performHandoff(intent);
    await runWithDatabaseConnectionOwner(() => saveReadwiseHandoffIntent(null, intent.groupId));
    return result;
  } catch (error) {
    if (!pendingResult(error)) {
      await runWithDatabaseConnectionOwner(() => saveReadwiseHandoffIntent(null, intent.groupId));
      throw error;
    }
    return runWithDatabaseConnectionOwner(loadReadwiseHostAssignment);
  }
}

function singleFlight(intent: ReadwiseHandoffIntent) {
  if (activeHandoff) {
    if (!sameIntent(activeHandoff.intent, intent)) {
      throw new Error('readwise_handoff_in_progress');
    }
    return activeHandoff.promise;
  }
  const promise = runHandoff(intent).finally(() => { activeHandoff = null; });
  activeHandoff = { intent, promise };
  return promise;
}

export async function activateReadwiseWithHandoff(options: {
  forceCurrent?: boolean; selectionSource?: 'automatic' | 'chosen'
} = {}) {
  const initial = await runWithDatabaseConnectionOwner(snapshot);
  if (!initial.group || (initial.assignment.is_active && !options.forceCurrent)) return initial.assignment;
  const intent: ReadwiseHandoffIntent = { dbPath: initial.dbPath,
    groupId: initial.group.group_id,
    mode: initial.mode as 'api' | 'relay',
    ownerId: initial.assignment.active_device_identity_key,
    epoch: initial.assignment.active_owner_epoch,
    targetId: initial.group.local_device_identity_key,
    selectionSource: options.selectionSource ?? 'chosen', forceCurrent: options.forceCurrent ?? false };
  if (activeHandoff && !sameIntent(activeHandoff.intent, intent)) {
    throw new Error('readwise_handoff_in_progress');
  }
  await runWithDatabaseConnectionOwner(() => saveReadwiseHandoffIntent(intent, intent.groupId));
  return singleFlight(intent);
}

export async function continuePendingReadwiseHandoff() {
  const intent = await runWithDatabaseConnectionOwner(currentIntent);
  if (!intent) return null;
  return singleFlight(intent);
}

async function performHandoff(intent: ReadwiseHandoffIntent) {
  const resumed = await runWithDatabaseConnectionOwner(resumePreparedActivation);
  if (resumed) return resumed;
  const initial = await runWithDatabaseConnectionOwner(snapshot);
  if (!initial.group || (initial.assignment.is_active && !intent.forceCurrent)) return initial.assignment;
  const localId = initial.group.local_device_identity_key;
  const groupId = initial.group.group_id;
  const ownerId = initial.assignment.active_device_identity_key;
  if (intent.dbPath !== initial.dbPath || intent.groupId !== groupId ||
      intent.targetId !== localId ||
      intent.ownerId !== ownerId || intent.epoch !== initial.assignment.active_owner_epoch ||
      intent.mode !== initial.mode) throw new Error('readwise_handoff_state_changed');
  if (initial.assignment.activation_blocked_reason === 'handoff-in-progress') {
    const guard = await runWithDatabaseConnectionOwner(() => loadReadwiseOwnerGuard(groupId));
    if (ownerId !== localId || guard?.state !== 'relinquished' ||
        guard.targetId !== localId || guard.epoch !== initial.assignment.active_owner_epoch) {
      throw new Error('readwise_handoff_in_progress');
    }
  }
  const targets = await runWithDatabaseConnectionOwner(() => stopTargets(groupId, localId, ownerId));
  const request: ReadwiseStopRequest = { epoch: initial.assignment.active_owner_epoch,
    groupId, mode: initial.mode as 'api' | 'relay', ownerId,
    requestId: randomUUID(), targetId: localId };
  const endpoints = new Map(loadDesktopSyncGroupMemberEndpoints(groupId)
    .map((peer) => [peer.peer_device_id, peer]));
  for (const deviceId of targets) {
    const peer = deviceId === localId ? null : endpoints.get(deviceId);
    if (deviceId !== localId && !peer) throw new Error('readwise_member_unreachable');
    await waitForStop(deviceId, peer ?? null, request);
  }
  return runWithDatabaseConnectionOwner(() => {
    const current = snapshot();
    if (!current.group || current.group.group_id !== groupId || current.mode !== request.mode ||
        current.assignment.active_device_identity_key !== ownerId ||
        current.assignment.active_owner_epoch !== request.epoch) throw new Error('readwise_handoff_state_changed');
    const nextEpoch = request.epoch + 1;
    saveReadwiseOwnerGuard({ epoch: nextEpoch, groupId, mode: request.mode,
      ownerId: localId, state: 'active', targetId: null });
    saveJsonSetting('readwise_active_host', { device_identity_key: localId,
      epoch: nextEpoch, host_name: current.assignment.current_host_name,
      selection_source: intent.selectionSource ?? 'chosen' });
    resumeReadwiseExecutionAfterActivation();
    return loadReadwiseHostAssignment();
  });
}

import { randomUUID } from 'node:crypto';

import { loadOrCreateDesktopDeviceId } from '../database/deviceIdentity.js';
import { loadDesktopSyncGroup, recordSyncGroupDeparture } from '../database/syncGroupStore.js';

import {
  loadPairedSyncGroupPeers,
  removeSyncGroupPeerCredentials
} from './companionPairingStore.js';
import { createDesktopSyncGroupSignedHeaders, requestJson } from './desktopSyncGroupHttp.js';

export const SYNC_GROUP_DEPARTURE_PATH = '/companion/sync-group/departure';

export function acceptSyncGroupDeparture(bodyText: string, authenticatedDeviceId: string) {
  const payload = JSON.parse(bodyText) as Record<string, unknown>;
  const group = loadDesktopSyncGroup();
  const deviceId = string(payload.device_id);
  const groupId = string(payload.group_id);
  const authorizedByDeviceId = string(payload.authorized_by_device_id);
  if (!group || group.group_id !== groupId || authorizedByDeviceId !== authenticatedDeviceId) {
    throw new Error('sync_group_departure_authorization_invalid');
  }
  const local = deviceId === group.local_device_id;
  recordSyncGroupDeparture({
    authorizationId: string(payload.authorization_id),
    authorizedByDeviceId,
    deviceId,
    groupId,
    leftAt: string(payload.left_at),
    local
  });
  const revokedIds = local ? loadPairedSyncGroupPeers(groupId).map((peer) => peer.peer_device_id) : [deviceId];
  for (const revokedId of revokedIds) removeSyncGroupPeerCredentials(groupId, revokedId);
  return { status: 'accepted' };
}

export async function removeDesktopSyncGroupMember(deviceId: string) {
  const group = loadDesktopSyncGroup();
  const localDeviceId = loadOrCreateDesktopDeviceId();
  if (!group || group.local_member_state !== 'active' || deviceId === localDeviceId
    || !group.members.some((member) => member.device_id === deviceId && member.state === 'active')) {
    throw new Error('sync_group_member_removal_invalid');
  }
  const departure = createDeparture(group.group_id, deviceId, localDeviceId, 'remove');
  await broadcastDeparture(departure, loadPairedSyncGroupPeers(group.group_id));
  recordSyncGroupDeparture({
    authorizationId: departure.authorization_id, authorizedByDeviceId: localDeviceId,
    deviceId, groupId: group.group_id, leftAt: departure.left_at
  });
  removeSyncGroupPeerCredentials(group.group_id, deviceId);
}

export async function leaveDesktopSyncGroup() {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const deviceId = loadOrCreateDesktopDeviceId();
  const departure = createDeparture(group.group_id, deviceId, deviceId, 'leave');
  const peers = loadPairedSyncGroupPeers(group.group_id);
  const hasOtherActiveMember = group.members.some((member) =>
    member.device_id !== deviceId && member.state === 'active');
  if (hasOtherActiveMember && peers.length === 0) {
    throw new Error('sync_group_departure_peer_unavailable');
  }
  const delivered = await broadcastDeparture(departure, peers);
  if (peers.length > 0 && !delivered) throw new Error('sync_group_departure_peer_unavailable');
  recordSyncGroupDeparture({
    authorizationId: departure.authorization_id, authorizedByDeviceId: deviceId,
    deviceId, groupId: group.group_id, leftAt: departure.left_at, local: true
  });
  for (const peer of peers) removeSyncGroupPeerCredentials(group.group_id, peer.peer_device_id);
}

function createDeparture(groupId: string, deviceId: string, authorizerId: string, action: 'leave' | 'remove') {
  return {
    authorization_id: `${action}-${randomUUID()}`,
    authorized_by_device_id: authorizerId,
    device_id: deviceId,
    group_id: groupId,
    left_at: new Date().toISOString()
  };
}

async function broadcastDeparture(departure: ReturnType<typeof createDeparture>, peers: ReturnType<typeof loadPairedSyncGroupPeers>) {
  const body = JSON.stringify(departure);
  let delivered = false;
  for (const peer of peers) {
    try {
      await requestJson(`${peer.endpoint_url}${SYNC_GROUP_DEPARTURE_PATH}`, {
        body, method: 'POST', headers: { 'Content-Type': 'application/json', ...createDesktopSyncGroupSignedHeaders({
          body, groupId: departure.group_id, localDeviceId: departure.authorized_by_device_id, method: 'POST',
          pathWithQuery: SYNC_GROUP_DEPARTURE_PATH, secret: peer.secret
        }) }
      });
      delivered = true;
    } catch { /* the persisted departure still revokes the member on later group-fact sync */ }
  }
  return delivered;
}

function string(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_departure_payload_invalid');
  return value.trim();
}

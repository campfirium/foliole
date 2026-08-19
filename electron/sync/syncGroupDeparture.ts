import { randomUUID } from 'node:crypto';

import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { loadDesktopSyncGroup, recordSyncGroupDeparture } from '../database/syncGroupStore.js';

import {
  loadPairedSyncGroupPeers,
  removeSyncGroupPeerCredentials
} from './companionPairingStore.js';
import { postDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export const SYNC_GROUP_DEPARTURE_PATH = '/companion/sync-group/departure';

export function acceptSyncGroupDeparture(bodyText: string, authenticatedDeviceId: string) {
  const payload = JSON.parse(bodyText) as Record<string, unknown>;
  const group = loadDesktopSyncGroup();
  const hostName = string(payload.host_name);
  const groupId = string(payload.group_id);
  const authorizedByHostName = string(payload.authorized_by_host_name);
  const authenticatedHostName = loadPairedSyncGroupPeers(groupId)
    .find((peer) => peer.peer_device_id === authenticatedDeviceId)?.peer_host_name;
  if (!group || group.group_id !== groupId || authorizedByHostName !== authenticatedHostName) {
    throw new Error('sync_group_departure_authorization_invalid');
  }
  const local = hostName === group.local_host_name;
  recordSyncGroupDeparture({
    authorizationId: string(payload.authorization_id),
    authorizedByHostName,
    hostName,
    groupId,
    leftAt: string(payload.left_at),
    local
  });
  const revokedIds = local ? loadPairedSyncGroupPeers(groupId).map((peer) => peer.peer_device_id)
    : loadPairedSyncGroupPeers(groupId)
      .filter((peer) => peer.peer_host_name === hostName).map((peer) => peer.peer_device_id);
  for (const revokedId of revokedIds) removeSyncGroupPeerCredentials(groupId, revokedId);
  return { status: 'accepted' };
}

export async function removeDesktopSyncGroupMember(hostName: string) {
  const group = loadDesktopSyncGroup();
  const localHostName = loadOrCreateDesktopHostName();
  if (!group || group.local_member_state !== 'active' || hostName === localHostName
    || !group.members.some((member) => member.host_name === hostName && member.state === 'active')) {
    throw new Error('sync_group_member_removal_invalid');
  }
  const departure = createDeparture(group.group_id, hostName, localHostName, 'remove');
  await broadcastDeparture(departure, loadPairedSyncGroupPeers(group.group_id));
  recordSyncGroupDeparture({
    authorizationId: departure.authorization_id, authorizedByHostName: localHostName,
    hostName, groupId: group.group_id, leftAt: departure.left_at
  });
  for (const peer of loadPairedSyncGroupPeers(group.group_id)) {
    if (peer.peer_host_name === hostName) removeSyncGroupPeerCredentials(group.group_id, peer.peer_device_id);
  }
}

export async function leaveDesktopSyncGroup() {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const hostName = loadOrCreateDesktopHostName();
  const departure = createDeparture(group.group_id, hostName, hostName, 'leave');
  const peers = loadPairedSyncGroupPeers(group.group_id);
  const hasOtherActiveMember = group.members.some((member) =>
    member.host_name !== hostName && member.state === 'active');
  if (hasOtherActiveMember && peers.length === 0) {
    throw new Error('sync_group_departure_peer_unavailable');
  }
  const delivered = await broadcastDeparture(departure, peers);
  if (peers.length > 0 && !delivered) throw new Error('sync_group_departure_peer_unavailable');
  recordSyncGroupDeparture({
    authorizationId: departure.authorization_id, authorizedByHostName: hostName,
    hostName, groupId: group.group_id, leftAt: departure.left_at, local: true
  });
  for (const peer of peers) removeSyncGroupPeerCredentials(group.group_id, peer.peer_device_id);
}

function createDeparture(groupId: string, hostName: string, authorizerHostName: string, action: 'leave' | 'remove') {
  return {
    authorization_id: `${action}-${randomUUID()}`,
    authorized_by_host_name: authorizerHostName,
    host_name: hostName,
    group_id: groupId,
    left_at: new Date().toISOString()
  };
}

async function broadcastDeparture(departure: ReturnType<typeof createDeparture>, peers: ReturnType<typeof loadPairedSyncGroupPeers>) {
  const body = JSON.stringify(departure);
  const key = loadDesktopWorkgroupKey(departure.group_id);
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  let delivered = false;
  for (const peer of peers) {
    try {
      await postDesktopWorkgroupJson({
        body, endpointUrl: peer.endpoint_url, groupId: departure.group_id,
        localDeviceId: peer.local_device_id,
        pathWithQuery: SYNC_GROUP_DEPARTURE_PATH, secret: key.group_key
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

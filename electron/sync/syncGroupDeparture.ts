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
  if (!group || group.group_id !== groupId || deviceId !== authenticatedDeviceId
    || authorizedByDeviceId !== deviceId) {
    throw new Error('sync_group_departure_authorization_invalid');
  }
  recordSyncGroupDeparture({
    authorizationId: string(payload.authorization_id),
    authorizedByDeviceId,
    deviceId,
    groupId,
    leftAt: string(payload.left_at)
  });
  removeSyncGroupPeerCredentials(groupId, deviceId);
  return { status: 'accepted' };
}

export async function leaveDesktopSyncGroup() {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const deviceId = loadOrCreateDesktopDeviceId();
  const departure = {
    authorization_id: `leave-${randomUUID()}`,
    authorized_by_device_id: deviceId,
    device_id: deviceId,
    group_id: group.group_id,
    left_at: new Date().toISOString()
  };
  const body = JSON.stringify(departure);
  const peers = loadPairedSyncGroupPeers(group.group_id);
  if (group.members.some((member) => member.device_id !== deviceId) && peers.length === 0) {
    throw new Error('sync_group_departure_peer_unavailable');
  }
  let delivered = false;
  for (const peer of peers) {
    try {
      await requestJson(`${peer.endpoint_url}${SYNC_GROUP_DEPARTURE_PATH}`, {
        body, method: 'POST', headers: {
          'Content-Type': 'application/json',
          ...createDesktopSyncGroupSignedHeaders({
            body, groupId: group.group_id, localDeviceId: deviceId, method: 'POST',
            pathWithQuery: SYNC_GROUP_DEPARTURE_PATH, secret: peer.secret
          })
        }
      });
      delivered = true;
    } catch { /* another active peer may still accept the departure */ }
  }
  if (peers.length > 0 && !delivered) throw new Error('sync_group_departure_peer_unavailable');
  recordSyncGroupDeparture({
    authorizationId: departure.authorization_id, authorizedByDeviceId: deviceId,
    deviceId, groupId: group.group_id, leftAt: departure.left_at, local: true
  });
  for (const peer of peers) removeSyncGroupPeerCredentials(group.group_id, peer.peer_device_id);
}

function string(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('sync_group_departure_payload_invalid');
  return value.trim();
}

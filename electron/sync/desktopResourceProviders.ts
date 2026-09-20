import { RESOURCE_AVAILABILITY_PATH, type ResourceNeed } from '../../lib/platform/resourceAvailabilityContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { isDesktopSyncGroupDeviceBlocked } from '../database/syncGroupMemberStateStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { createDesktopWorkgroupPost, readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { loadDesktopSyncGroupMemberEndpoints } from './desktopSyncGroupMemberStateSession.js';
import { assertDesktopSyncGroupPeerCompatible } from './desktopSyncGroupPeerCompatibility.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export type DesktopResourceProvider = DesktopSyncGroupPeer & { deviceId: string; endpointUrl: string };

export function loadDesktopResourceProviders(target: DesktopSyncGroupPeer) {
  const eligibleDeviceIds = loadEligibleResourceMemberIds(target.group_id);
  const peers = [target, ...loadDesktopSyncGroupMemberEndpoints(target.group_id)];
  const unique = new Map(peers.map((peer) => [peer.peer_device_id, peer]));
  return {
    eligibleDeviceIds,
    providers: [...unique.values()].filter((peer) => eligibleDeviceIds.includes(peer.peer_device_id))
      .map((peer): DesktopResourceProvider => {
        const provider = { ...peer, deviceId: peer.peer_device_id, endpointUrl: peer.endpoint_url };
        delete provider.route_kind;
        return provider;
      })
  };
}

export function loadEligibleResourceMemberIds(groupId: string) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== groupId) return [];
  return group.devices.filter((device) => device.state === 'active' &&
    device.device_identity_key !== group.local_device_identity_key &&
    !isDesktopSyncGroupDeviceBlocked(groupId, device.device_identity_key)).map((device) => device.device_identity_key);
}

export async function queryDesktopResourceAvailability(peer: DesktopResourceProvider, needs: readonly ResourceNeed[]) {
  await assertDesktopSyncGroupPeerCompatible(peer);
  const membership = await runWithDatabaseConnectionOwner(() => exchangeDesktopSyncGroupMemberState(peer));
  if (membership.localExited || membership.peerBlocked) throw new Error('sync_group_device_not_active');
  const encrypted = await runWithDatabaseConnectionOwner(() => createDesktopWorkgroupPost({
    body: JSON.stringify({ resources: needs }), groupId: peer.group_id, localDeviceId: peer.local_device_id,
    pathWithQuery: RESOURCE_AVAILABILITY_PATH, secret: requireResourceGroupKey(peer.group_id)
  }));
  const response = await fetch(`${peer.endpoint_url}${RESOURCE_AVAILABILITY_PATH}`, {
    body: encrypted.body, headers: encrypted.headers, method: 'POST', signal: AbortSignal.timeout(30_000)
  });
  const body = await readDesktopWorkgroupResponse({ contentType: 'application/json; charset=utf-8',
    groupId: peer.group_id, method: 'POST', pathWithQuery: RESOURCE_AVAILABILITY_PATH, response });
  return JSON.parse(body.toString('utf8')) as unknown;
}

export function requireResourceGroupKey(groupId: string) {
  const key = loadDesktopWorkgroupKey(groupId);
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  return key.group_key;
}

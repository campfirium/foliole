import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { isDesktopSyncGroupDeviceBlocked } from '../database/syncGroupMemberStateStore.js';

import type { DesktopAnchorTarget } from './desktopAnchorTopologySession.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export function routeFromTarget(group: SyncGroupPayload, target: DesktopAnchorTarget) {
  return routeFromCandidate(group, {
    endpoint_url: target.endpointUrl,
    group_id: target.groupId,
    provider_device_id: target.peerDeviceId
  });
}

export function routeFromCandidate(
  group: SyncGroupPayload,
  candidate: {
    endpoint_url: string;
    group_id: string;
    provider_device_id: string;
    provider_device_name?: string;
    provider_platform?: string;
  }
): DesktopSyncGroupPeer | null {
  const remote = group.devices.find((device) =>
    device.device_identity_key === candidate.provider_device_id && device.state === 'active');
  if (candidate.group_id !== group.group_id ||
      isDesktopSyncGroupDeviceBlocked(group.group_id, candidate.provider_device_id)) return null;
  return {
    endpoint_url: candidate.endpoint_url,
    group_id: group.group_id,
    local_device_id: group.local_device_identity_key,
    peer_device_id: candidate.provider_device_id,
    peer_device_name: remote?.device_name ?? candidate.provider_device_name ?? candidate.provider_device_id,
    peer_platform: remote?.platform ?? candidate.provider_platform ?? 'desktop',
    route_kind: 'anchor'
  };
}

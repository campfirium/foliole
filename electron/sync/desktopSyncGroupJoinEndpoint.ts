import { discoverDesktopSyncGroups } from './desktopSyncGroupDiscovery.js';
import {
  loadDesktopSyncGroupJoinState,
  refreshDesktopSyncGroupPendingJoinEndpoint
} from './desktopSyncGroupJoinState.js';

export async function refreshDesktopSyncGroupPendingJoinFromDiscovery() {
  const pending = loadDesktopSyncGroupJoinState().pending;
  if (!pending) return false;
  const candidates = await discoverDesktopSyncGroups();
  const matches = candidates.filter((candidate) =>
    candidate.group_id === pending.candidate.group_id
    && candidate.provider_device_id === pending.candidate.provider_device_id
    && candidate.timeline_id === pending.candidate.timeline_id
  );
  const candidate = matches.find((item) => item.endpoint_url !== pending.candidate.endpoint_url)
    ?? matches[0];
  return candidate ? refreshDesktopSyncGroupPendingJoinEndpoint({
    endpointUrl: candidate.endpoint_url,
    groupId: candidate.group_id,
    providerDeviceId: candidate.provider_device_id,
    timelineId: candidate.timeline_id
  }) : false;
}

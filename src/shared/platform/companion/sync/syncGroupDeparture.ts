import { createCompanionUuid } from '../../companionUuid';
import { createSignedRequestHeaders } from '../../companionWorkspacePairing';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import {
  loadCompanionSyncGroup,
  loadCompanionSyncGroupEndpoint,
  recordLocalCompanionSyncGroupDeparture
} from './syncGroupStore';

export const COMPANION_SYNC_GROUP_DEPARTURE_PATH = '/companion/sync-group/departure';

export async function leaveCompanionSyncGroup() {
  const group = await loadCompanionSyncGroup();
  const endpoint = await loadCompanionSyncGroupEndpoint();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  if (!group.members.some((member) => member.device_id !== group.local_device_id) || !endpoint) {
    throw new Error('sync_group_departure_peer_unavailable');
  }
  const departure = {
    authorization_id: `leave-${createCompanionUuid()}`,
    authorized_by_device_id: group.local_device_id,
    device_id: group.local_device_id,
    group_id: group.group_id,
    left_at: new Date().toISOString()
  };
  const body = JSON.stringify(departure);
  const headers = await createSignedRequestHeaders({
    bodyText: body,
    endpointUrl: endpoint,
    method: 'POST',
    pathWithQuery: COMPANION_SYNC_GROUP_DEPARTURE_PATH
  });
  const response = await FolioleCompanionSync.desktopHttpRequest({
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
    method: 'POST',
    url: `${endpoint}${COMPANION_SYNC_GROUP_DEPARTURE_PATH}`
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`sync_group_departure_http_${response.status}`);
  }
  await recordLocalCompanionSyncGroupDeparture({
    authorizationId: departure.authorization_id,
    deviceId: departure.device_id,
    groupId: departure.group_id,
    leftAt: departure.left_at
  });
  await FolioleCompanionSync.stopSyncGroupProvider();
  await FolioleCompanionSync.clearSyncGroupCredentials();
}

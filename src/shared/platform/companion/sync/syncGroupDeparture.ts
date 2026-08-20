import { createCompanionUuid } from '../../companionUuid';
import { createSignedRequestHeaders } from '../../companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime
} from '../../companionWorkspaceRuntimeRepository';
import {
  bindCompanionWorkspaceSyncTarget,
  resolveReachableCompanionWorkspaceSyncEndpoints,
  type CompanionWorkspaceSyncTarget
} from '../network/companionWorkspaceEndpoint';
import { prepareNativeCompanionWorkgroupRequest } from '../network/signedRequest';

import {
  loadCompanionSyncGroup,
  loadCompanionSyncGroupEndpoint,
  recordLocalCompanionSyncGroupDeparture
} from './syncGroupStore';

export const COMPANION_SYNC_GROUP_DEPARTURE_PATH = '/companion/sync-group/departure';

async function sendDepartureToTarget(target: CompanionWorkspaceSyncTarget, body: string) {
  await bindCompanionWorkspaceSyncTarget(target);
  if (isNativeAndroidCompanionRuntime()) {
    const prepared = await prepareNativeCompanionWorkgroupRequest({
      bodyText: body, endpointUrl: target.endpointUrl, method: 'POST',
      pathWithQuery: COMPANION_SYNC_GROUP_DEPARTURE_PATH
    });
    await requireAccepted(await FolioleCompanionSync.desktopHttpRequest({
      body: prepared.body, headers: prepared.headers, method: 'POST',
      url: `${target.endpointUrl}${COMPANION_SYNC_GROUP_DEPARTURE_PATH}`
    }));
    return;
  }
  const headers = await createSignedRequestHeaders({
    bodyText: body, endpointUrl: target.endpointUrl, method: 'POST', pathWithQuery: COMPANION_SYNC_GROUP_DEPARTURE_PATH
  });
  const response = await FolioleCompanionSync.desktopHttpRequest({
    body, headers: { 'Content-Type': 'application/json', ...headers }, method: 'POST',
    url: `${target.endpointUrl}${COMPANION_SYNC_GROUP_DEPARTURE_PATH}`
  });
  await requireAccepted(response);
}

function requireAccepted(response: { status: number }) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`sync_group_departure_http_${response.status}`);
  }
}

async function deliverDeparture(endpoint: string, body: string) {
  const targets = await resolveReachableCompanionWorkspaceSyncEndpoints(endpoint, {
    allowWhileNotParticipating: true
  });
  let lastError: unknown;
  for (const target of targets) {
    try {
      await sendDepartureToTarget(target, body);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error('sync_group_departure_peer_unavailable');
}

export async function leaveCompanionSyncGroup() {
  const group = await loadCompanionSyncGroup();
  const endpoint = await loadCompanionSyncGroupEndpoint();
  if (!group || group.local_member_state !== 'active') throw new Error('sync_group_not_available');
  const hasOtherActiveMember = group.members.some((member) =>
    member.host_name !== group.local_host_name && member.state === 'active'
  );
  if (hasOtherActiveMember && !endpoint) throw new Error('sync_group_departure_peer_unavailable');
  const departure = {
    authorization_id: `leave-${createCompanionUuid()}`,
    authorized_by_host_name: group.local_host_name,
    host_name: group.local_host_name,
    group_id: group.group_id,
    left_at: new Date().toISOString()
  };
  if (hasOtherActiveMember && endpoint) {
    await deliverDeparture(endpoint, JSON.stringify(departure));
  }
  await FolioleCompanionSync.stopSyncGroupProvider();
  await FolioleCompanionSync.clearSyncGroupCredentials();
  await recordLocalCompanionSyncGroupDeparture({
    authorizationId: departure.authorization_id,
    hostName: departure.host_name,
    groupId: departure.group_id,
    leftAt: departure.left_at
  });
}

import {
  parseSyncGroupMemberState,
  type SyncGroupMemberStatePayload
} from '../../../../../lib/platform/syncGroupMemberStateContract';
import { FolioleCompanionSync, isNativeCompanionNetworkRuntime } from '../../companionWorkspaceRuntimeRepository';
import {
  applyCompanionSyncGroupMemberState,
  isCompanionSyncGroupDeviceBlocked,
  loadCompanionSyncGroupMemberState
} from '../sync/syncGroupMemberStateStore';

import type { CompanionWorkspaceSyncTarget } from './companionWorkspaceEndpoint';
import { createSignedRequestHeaders } from './signedRequest';

export const COMPANION_SYNC_GROUP_MEMBER_STATE_PATH = '/sync-group/member-state';

export async function exchangeCompanionSyncGroupMemberState(target: CompanionWorkspaceSyncTarget) {
  if (!isNativeCompanionNetworkRuntime()) return { localExited: false, peerRemoved: false };
  if (!target.deviceId || !target.groupId) throw new Error('sync_group_member_state_target_missing');
  const state = await loadCompanionSyncGroupMemberState();
  const bodyText = JSON.stringify(state);
  const headers = await createSignedRequestHeaders({
    bodyText, endpointUrl: target.endpointUrl, method: 'POST',
    pathWithQuery: COMPANION_SYNC_GROUP_MEMBER_STATE_PATH
  });
  const response = await post(target.endpointUrl, headers, bodyText);
  if (response.status >= 400) throw new Error(`sync_group_member_state_failed_${response.status}`);
  const applied = await applyCompanionSyncGroupMemberState(
    parseSyncGroupMemberState(JSON.parse(response.body)) as SyncGroupMemberStatePayload,
    target.deviceId
  );
  return {
    localExited: applied.local_exited,
    peerRemoved: await isCompanionSyncGroupDeviceBlocked(target.groupId, target.deviceId)
  };
}

async function post(endpointUrl: string, headers: Record<string, string>, body: string) {
  const url = `${endpointUrl}${COMPANION_SYNC_GROUP_MEMBER_STATE_PATH}`;
  if (isNativeCompanionNetworkRuntime()) {
    return FolioleCompanionSync.desktopHttpRequest({ body, headers, method: 'POST', url });
  }
  const response = await fetch(url, { body, headers, method: 'POST' });
  return { body: await response.text(), status: response.status };
}

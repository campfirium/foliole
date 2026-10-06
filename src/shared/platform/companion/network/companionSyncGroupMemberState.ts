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
import { prepareNativeCompanionWorkgroupRequest } from './signedRequest';

export const COMPANION_SYNC_GROUP_MEMBER_STATE_PATH = '/sync-group/member-state';

export async function exchangeCompanionSyncGroupMemberState(target: CompanionWorkspaceSyncTarget) {
  if (!isNativeCompanionNetworkRuntime()) return {
    localExited: false, normalSyncReady: true, peerLibraryEpoch: null,
    peerRemoved: false, restoreFromPeer: null
  };
  if (!target.deviceId || !target.groupId) throw new Error('sync_group_member_state_target_missing');
  const state = await loadCompanionSyncGroupMemberState();
  const prepared = await prepareNativeCompanionWorkgroupRequest({
    bodyText: JSON.stringify(state), endpointUrl: target.endpointUrl, method: 'POST',
    pathWithQuery: COMPANION_SYNC_GROUP_MEMBER_STATE_PATH
  });
  const response = await post(target.endpointUrl, prepared.headers, prepared.body);
  if (response.status >= 400) throw new Error(`sync_group_member_state_failed_${response.status}`);
  const incoming = parseSyncGroupMemberState(JSON.parse(response.body)) as SyncGroupMemberStatePayload;
  const applied = await applyCompanionSyncGroupMemberState(incoming, target.deviceId);
  const localRestore = applied.state.restore;
  return {
    localExited: applied.local_exited,
    normalSyncReady: applied.normal_sync_ready && !incoming.adopting_from,
    peerLibraryEpoch: incoming.library_epoch,
    peerRemoved: await isCompanionSyncGroupDeviceBlocked(target.groupId, target.deviceId),
    restoreFromPeer: localRestore && !localRestore.applied && incoming.restore?.applied &&
      incoming.restore.event.restore_id === localRestore.event.restore_id &&
      localRestore.event.source_device_identity_key === target.deviceId
      ? localRestore.event.restore_id : null
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

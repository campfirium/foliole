import { parseSyncGroupMemberState } from '../../lib/platform/syncGroupMemberStateContract.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import {
  applyDesktopSyncGroupMemberState,
  isDesktopSyncGroupDeviceBlocked,
  loadDesktopSyncGroupMemberState
} from '../database/syncGroupMemberStateStore.js';

import { postDesktopWorkgroupJson } from './desktopSyncGroupHttp.js';
import { markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

export const SYNC_GROUP_MEMBER_STATE_PATH = '/sync-group/member-state';

export function acceptDesktopSyncGroupMemberState(bodyText: string, authenticatedDeviceId: string) {
  const incoming = parseSyncGroupMemberState(JSON.parse(bodyText));
  const applied = applyDesktopSyncGroupMemberState(incoming, authenticatedDeviceId);
  markDesktopSyncGroupMemberStateReady(authenticatedDeviceId);
  return applied;
}

export async function exchangeDesktopSyncGroupMemberState(peer: DesktopSyncGroupPeer) {
  const request = await runWithDatabaseConnectionOwner(() => {
    const workgroup = loadDesktopWorkgroupKey(peer.group_id);
    if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
    return { body: JSON.stringify(loadDesktopSyncGroupMemberState()), secret: workgroup.group_key };
  });
  const payload = await postDesktopWorkgroupJson({
    body: request.body,
    endpointUrl: peer.endpoint_url,
    groupId: peer.group_id,
    localDeviceId: peer.local_device_id,
    pathWithQuery: SYNC_GROUP_MEMBER_STATE_PATH,
    secret: request.secret
  });
  return runWithDatabaseConnectionOwner(() => {
    const applied = applyDesktopSyncGroupMemberState(
      parseSyncGroupMemberState(payload), peer.peer_device_id
    );
    return {
      localExited: applied.localExited,
      peerBlocked: isDesktopSyncGroupDeviceBlocked(peer.group_id, peer.peer_device_id)
    };
  });
}

export async function publishDesktopSyncGroupMemberState(
  peer: DesktopSyncGroupPeer,
  state: SyncGroupMemberStatePayload
) {
  const secret = await runWithDatabaseConnectionOwner(() => {
    const workgroup = loadDesktopWorkgroupKey(peer.group_id);
    if (!workgroup) throw new Error('sync_group_workgroup_key_missing');
    return workgroup.group_key;
  });
  await postDesktopWorkgroupJson({
    body: JSON.stringify(state),
    endpointUrl: peer.endpoint_url,
    groupId: peer.group_id,
    localDeviceId: peer.local_device_id,
    pathWithQuery: SYNC_GROUP_MEMBER_STATE_PATH,
    secret
  });
}

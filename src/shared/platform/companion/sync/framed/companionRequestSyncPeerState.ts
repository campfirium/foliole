import type { SyncGroupMemberStatePayload } from '../../../../../../lib/platform/syncGroupMemberStateContract.js';

const peers = new Map<string, SyncGroupMemberStatePayload>();
const key = (groupId: string, deviceId: string) => `${groupId}\0${deviceId}`;

export function rememberCompanionRequestSyncProviderState(incoming: SyncGroupMemberStatePayload,
  applied: { normal_sync_ready: boolean; state: SyncGroupMemberStatePayload }) {
  const restore = applied.state.restore;
  const canSupplyRestore = Boolean(restore?.applied &&
    restore.event.source_device_identity_key === applied.state.sender_device_identity_key &&
    (incoming.restore === null || (!incoming.restore.applied &&
      restore.event.restore_id === incoming.restore.event.restore_id)));
  rememberCompanionRequestSyncPeerState(incoming, applied.normal_sync_ready || canSupplyRestore);
}

export function rememberCompanionRequestSyncPeerState(state: SyncGroupMemberStatePayload, ready: boolean) {
  const id = key(state.group_id, state.sender_device_identity_key);
  if (ready) peers.set(id, structuredClone(state));
  else peers.delete(id);
}

export function requireCompanionRequestSyncPeerState(groupId: string, deviceId: string, epoch: string) {
  const state = peers.get(key(groupId, deviceId));
  if (!state || state.library_epoch !== epoch) throw new Error('sync_group_member_state_required');
  return structuredClone(state);
}

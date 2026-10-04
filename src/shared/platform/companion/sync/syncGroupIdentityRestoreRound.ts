import { exchangeCompanionSyncGroupMemberState } from '../network/companionSyncGroupMemberState';
import { resolveCompanionSyncPeerHostName,
  resolveCompanionSyncPeerId } from '../network/syncGroupPeerIdentity';

import { applyCompanionSyncIdentityRestore } from './pack-apply/companionSyncIdentityRestoreApply';
import { probeCompanionSyncIdentityRestoreSet } from './syncGroupIdentityRestoreProbe';
import { stageCompanionSyncIdentityRestore } from './syncGroupIdentityRestoreStage';
import { loadCompanionSyncGroup } from './syncGroupStore';

/** Complete a fixed source restore before allowing ordinary bilateral exchange. */
export async function runCompanionSyncIdentityRestoreRound(endpointUrl: string,
  hostName: string, restoreId: string) {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const peerId = await resolveCompanionSyncPeerId(endpointUrl);
  const peerHostName = await resolveCompanionSyncPeerHostName(endpointUrl);
  const probe = await probeCompanionSyncIdentityRestoreSet({ endpointUrl,
    groupId: group.group_id, localDeviceId: group.local_device_identity_key,
    peerDeviceId: peerId, restoreId });
  try {
    const staged = await stageCompanionSyncIdentityRestore({ endpointUrl, probe });
    try {
      const applied = await applyCompanionSyncIdentityRestore({ hostName,
        peerHostName, snapshotPath: probe.snapshotPath, staged });
      const state = await exchangeCompanionSyncGroupMemberState({ endpointUrl,
        groupId: group.group_id, deviceId: peerId });
      if (state.localExited || state.peerRemoved || !state.normalSyncReady) {
        throw new Error('sync_identity_restore_member_state_not_ready');
      }
      return { appliedObjects: applied.applied ? staged.set.object_count : 0 };
    } finally { await staged.cleanup(); }
  } finally { await probe.cleanup(); }
}

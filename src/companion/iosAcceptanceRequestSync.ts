import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract';
import { exchangeCompanionSyncGroupMemberState } from '../shared/platform/companion/network/companionSyncGroupMemberState';
import { ensureCompanionSyncGroupDataOwner } from '../shared/platform/companion/sync/syncGroupProviderDataOwner';
import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { syncCompanionObjectsFromDesktop } from '../shared/platform/companionDesktopSyncObjects';

export async function syncIosAcceptanceRequest(
  endpointUrl: string,
  peer: { sourcePeerId: string },
  resourcesOnly = false
) {
  await ensureCompanionSyncGroupDataOwner();
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  if (!peer.sourcePeerId) throw new Error('ios_acceptance_request_peer_missing');
  const state = await exchangeCompanionSyncGroupMemberState({
    endpointUrl, deviceId: peer.sourcePeerId, groupId: group.group_id
  });
  if (state.localExited || state.peerRemoved || !state.normalSyncReady || !state.peerLibraryEpoch) {
    throw new Error('ios_acceptance_request_peer_unavailable');
  }
  return syncCompanionObjectsFromDesktop(endpointUrl, {
    resourcesOnly,
    framedPeer: { deviceId: peer.sourcePeerId, libraryEpoch: state.peerLibraryEpoch,
      protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION }
  });
}

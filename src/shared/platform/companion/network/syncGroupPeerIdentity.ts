import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

export async function resolveCompanionSyncPeerId(endpointUrl: string) {
  const group = await loadCompanionSyncGroup();
  const pairingModule = await import('../../companionWorkspacePairing');
  if (!group) {
    const peerId = (await pairingModule.loadCompanionPairingState()).remote_peer_id?.trim();
    if (!peerId) throw new Error('sync_delivery_peer_identity_unavailable');
    return peerId;
  }
  const discovery = await pairingModule.loadCompanionDiscovery(endpointUrl);
  if (discovery.group_id !== group.group_id || discovery.timeline_id !== group.timeline_id) {
    throw new Error('sync_group_identity_mismatch');
  }
  const peerId = discovery.peer_id?.trim();
  if (!peerId) throw new Error('sync_delivery_peer_identity_unavailable');
  return peerId;
}

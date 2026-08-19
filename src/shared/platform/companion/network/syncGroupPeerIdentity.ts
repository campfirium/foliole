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
  if (discovery.group_id !== group.group_id) {
    throw new Error('sync_group_identity_mismatch');
  }
  const peerId = discovery.peer_id?.trim();
  if (!peerId) throw new Error('sync_delivery_peer_identity_unavailable');
  return peerId;
}

export async function resolveCompanionSyncPeerHostName(endpointUrl: string) {
  const group = await loadCompanionSyncGroup();
  const pairingModule = await import('../../companionWorkspacePairing');
  if (!group) {
    const pairing = await pairingModule.loadCompanionPairingState();
    const hostName = pairing.remote_peer_name?.trim();
    if (!hostName) throw new Error('sync_group_source_host_unavailable');
    return hostName;
  }
  const discovery = await pairingModule.loadCompanionDiscovery(endpointUrl);
  if (discovery.group_id !== group.group_id) throw new Error('sync_group_identity_mismatch');
  const hostName = discovery.desktop_host_name?.trim();
  if (!hostName) throw new Error('sync_group_source_host_unavailable');
  return hostName;
}

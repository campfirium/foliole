import {
  loadCompanionPairingState,
  pairCompanionWithDesktop,
  requestCompanionPairing
} from '../shared/platform/companionWorkspacePairing';

const ACCEPTANCE_DESKTOP_NAME = 'Acceptance Desktop';
const ACCEPTANCE_DESKTOP_PLATFORM = 'darwin';

export async function pairIosAcceptanceCompanion(endpointUrl: string, hostName: string) {
  const pending = await requestCompanionPairing({
    endpointUrl,
    hostName,
    hostPlatform: 'ios-capacitor'
  });
  return pairCompanionWithDesktop({
    endpointUrl,
    hostName,
    hostPlatform: 'ios-capacitor',
    pairRequestId: pending.pair_request_id,
    remotePeerName: ACCEPTANCE_DESKTOP_NAME,
    remotePeerPlatform: ACCEPTANCE_DESKTOP_PLATFORM
  });
}

export async function loadIosAcceptanceSyncPeer() {
  const pairing = await loadCompanionPairingState();
  const sourceHostName = pairing.remote_peer_name?.trim();
  const sourcePeerId = pairing.remote_peer_id?.trim();
  if (!sourceHostName) throw new Error('sync_group_source_host_unavailable');
  if (!sourcePeerId) throw new Error('sync_pack_source_identity_unavailable');
  return { sourceHostName, sourcePeerId };
}

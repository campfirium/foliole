import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';
import { normalizePairingState } from '../../companionPairingState';
import {
  FolioleCompanionSync,
  normalizeEndpointUrl,
  type PairCompanionWithDesktopArgs,
  type PairCompanionWithDesktopResponse
} from '../../companionWorkspaceRuntimeRepository';

import { verifyNativePairingCanSignRequest } from './signedRequest';

export async function saveStandaloneNativePairing(
  args: PairCompanionWithDesktopArgs,
  payload: PairCompanionWithDesktopResponse,
  credentialSecret: string
) {
  await FolioleCompanionSync.savePairingCredentials({
    authorization_id: payload.authorization_id,
    credential_secret: credentialSecret,
    device_id: payload.device_id,
    device_kind: args.deviceKind,
    device_name: payload.device_id,
    device_secret: credentialSecret,
    host_name: payload.host_name ?? args.deviceName,
    host_platform: payload.host_platform ?? args.deviceKind,
    negotiated_protocol_version: payload.compatibility.negotiated_version
      ?? CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    paired_at: payload.paired_at,
    remote_peer_id: payload.peer_id,
    remote_peer_name: args.remotePeerName ?? null,
    remote_peer_platform: args.remotePeerPlatform ?? null,
    remote_protocol: payload.desktop_protocol
  });
  const stored = normalizePairingState(await FolioleCompanionSync.loadPairingState());
  if (!stored.is_paired) throw new Error('Native pairing credentials were not saved.');
  await verifyNativePairingCanSignRequest(normalizeEndpointUrl(args.endpointUrl));
  return stored;
}

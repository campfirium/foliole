import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';
import { normalizePairingState } from '../../companionPairingState';
import {
  FolioleCompanionSync,
  normalizeEndpointUrl,
  type PairCompanionWithDesktopArgs,
  type PairCompanionWithDesktopResponse
} from '../../companionWorkspaceRuntimeRepository';

import { verifyNativePairingCanSignRequest } from './signedRequest';

export async function persistNativePairingCredentials(
  args: PairCompanionWithDesktopArgs,
  payload: PairCompanionWithDesktopResponse,
  credentialSecret: string
) {
  await FolioleCompanionSync.savePairingCredentials({
    authorization_id: payload.authorization_id,
    credential_secret: credentialSecret,
    host_name: payload.host_name ?? args.hostName,
    host_platform: payload.host_platform ?? args.hostPlatform,
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
  return stored;
}

export async function saveStandaloneNativePairing(
  args: PairCompanionWithDesktopArgs,
  payload: PairCompanionWithDesktopResponse,
  credentialSecret: string
) {
  const stored = await persistNativePairingCredentials(args, payload, credentialSecret);
  await verifyNativePairingCanSignRequest(normalizeEndpointUrl(args.endpointUrl));
  return stored;
}

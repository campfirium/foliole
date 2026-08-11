import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../lib/platform/syncProtocolContract';

import { createSignedRequestHeaders, verifyNativePairingCanSignRequest } from './companion/network/signedRequest';
import {
  joinCompanionSyncGroup,
  loadCompanionSyncGroup,
  loadCompanionSyncGroupLibraryFacts,
  refreshActiveCompanionSyncGroupMembership
} from './companion/sync/syncGroupStore';
import {
  createCompanionPairingPublicKey,
  decryptCompanionPairingSecret,
  dropCompanionPairingPrivateKey
} from './companionPairingEncryption';
import { CompanionPairingHttpError, readCompanionPairingError } from './companionPairingHttpError';
import {
  clearWebPairingState,
  normalizePairingState,
  readWebPairingState,
  writeWebPairingState
} from './companionPairingState';
import { runCompanionSyncWriterTask } from './companionSyncWriterQueue';
import { createCompanionUuid } from './companionUuid';
import { discoverCompanionDesktop, discoverCompanionDesktops } from './companionWorkspaceDiscovery';
import {
  DISCOVERY_ENDPOINT_PATH,
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  type LoadCompanionDiscoveryResponse,
  normalizeEndpointUrl,
  PAIR_ENDPOINT_PATH,
  PAIR_REQUESTS_ENDPOINT_PATH,
  type PairCompanionWithDesktopArgs,
  type PairCompanionWithDesktopResponse,
  type RequestCompanionPairingArgs,
  type RequestCompanionPairingResponse
} from './companionWorkspaceRuntimeRepository';

const pairingKeyIdsByRequestId = new Map<string, string>();

export { discoverCompanionDesktop, discoverCompanionDesktops };


export async function loadCompanionPairingState() {
  if (!isNativeCompanionPairingRuntime()) {
    return readWebPairingState();
  }
  return normalizePairingState(await FolioleCompanionSync.loadPairingState());
}

export async function clearCompanionPairingCredentials() {
  if (!isNativeCompanionPairingRuntime()) {
    return clearWebPairingState();
  }
  return normalizePairingState(await runCompanionSyncWriterTask(() => FolioleCompanionSync.clearPairingCredentials()));
}

export { createSignedRequestHeaders };

export async function loadCompanionDiscovery(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const response = await requestDesktop(`${normalizedEndpointUrl}${DISCOVERY_ENDPOINT_PATH}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Desktop discovery failed with ${response.status}.`);
  }
  return (await response.json()) as LoadCompanionDiscoveryResponse;
}

export async function requestCompanionPairing(args: RequestCompanionPairingArgs) {
  const normalizedEndpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const pairingKeyId = createCompanionUuid();
  const pairingPublicKey = await createCompanionPairingPublicKey(pairingKeyId);
  const usesSyncGroup = args.deviceKind === 'android-capacitor';
  const libraryFacts = usesSyncGroup ? await loadCompanionSyncGroupLibraryFacts() : null;
  const response = await requestDesktop(`${normalizedEndpointUrl}${PAIR_REQUESTS_ENDPOINT_PATH}`, {
    body: JSON.stringify({
      device_id: args.deviceId,
      device_kind: args.deviceKind,
      device_name: args.deviceName,
      ...(usesSyncGroup ? {
        group_id: args.groupId,
        library_facts: libraryFacts,
        timeline_id: args.timelineId
      } : {}),
      pairing_public_key: pairingPublicKey,
      protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  if (response.status !== 202 && response.status !== 409) {
    dropCompanionPairingPrivateKey(pairingKeyId);
    throw await readCompanionPairingError(response);
  }
  const payload = (await response.json()) as RequestCompanionPairingResponse & { error?: string };
  if (payload.error) {
    dropCompanionPairingPrivateKey(pairingKeyId);
    throw new CompanionPairingHttpError(response.status, payload.error, payload.compatibility ?? null);
  }
  pairingKeyIdsByRequestId.set(payload.pair_request_id, pairingKeyId);
  return payload;
}

export async function pairCompanionWithDesktop(args: PairCompanionWithDesktopArgs) {
  const usesSyncGroup = args.deviceKind === 'android-capacitor';
  const normalizedEndpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const response = await requestDesktop(`${normalizedEndpointUrl}${PAIR_ENDPOINT_PATH}`, {
    body: JSON.stringify({
      pair_request_id: args.pairRequestId
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  });
  if (!response.ok) {
    throw await readCompanionPairingError(response);
  }
  const payload = (await response.json()) as PairCompanionWithDesktopResponse;
  const pairingKeyId = pairingKeyIdsByRequestId.get(args.pairRequestId);
  if (!pairingKeyId) {
    throw new Error('Companion pairing key is no longer available.');
  }
  const deviceSecret = await decryptCompanionPairingSecret(pairingKeyId, payload.encrypted_device_secret);
  const providerSecret = usesSyncGroup && payload.provider_encrypted_device_secret
    ? await decryptCompanionPairingSecret(pairingKeyId, payload.provider_encrypted_device_secret)
    : null;
  pairingKeyIdsByRequestId.delete(args.pairRequestId);
  if (!isNativeCompanionPairingRuntime()) {
    return writeWebPairingState({
      device_id: payload.device_id,
      device_kind: args.deviceKind,
      device_name: args.deviceName,
      device_secret: deviceSecret,
      is_paired: true,
      negotiated_protocol_version: payload.compatibility.negotiated_version,
      paired_at: payload.paired_at,
      primary_device_id: payload.peer_id,
      remote_peer_id: payload.peer_id,
      remote_peer_name: args.remotePeerName ?? null,
      remote_peer_platform: args.remotePeerPlatform ?? null,
      remote_protocol: payload.desktop_protocol
    });
  }
  if (usesSyncGroup && !providerSecret) throw new Error('Sync Group provider pairing credentials are missing.');
  return saveNativePairing(args, payload, deviceSecret, providerSecret, usesSyncGroup);
}

async function saveNativePairing(
  args: PairCompanionWithDesktopArgs,
  payload: PairCompanionWithDesktopResponse,
  deviceSecret: string,
  providerSecret: string | null,
  usesSyncGroup: boolean
) {
  return runCompanionSyncWriterTask(async () => {
    await FolioleCompanionSync.savePairingCredentials({
      device_id: payload.device_id,
      device_kind: args.deviceKind,
      device_name: args.deviceName,
      device_secret: deviceSecret,
      ...(usesSyncGroup && payload.sync_group ? {
        endpoint_url: normalizeEndpointUrl(args.endpointUrl),
        ...(providerSecret ? { provider_device_secret: providerSecret } : {}),
        sync_group_id: payload.sync_group.group_id
      } : {}),
      negotiated_protocol_version: payload.compatibility.negotiated_version ?? CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
      paired_at: payload.paired_at,
      primary_device_id: payload.peer_id,
      remote_peer_id: payload.peer_id,
      remote_peer_name: args.remotePeerName ?? null,
      remote_peer_platform: args.remotePeerPlatform ?? null,
      remote_protocol: payload.desktop_protocol
    });
    const storedPairingState = normalizePairingState(await FolioleCompanionSync.loadPairingState());
    if (!storedPairingState.is_paired) throw new Error('Native pairing credentials were not saved.');
    if (usesSyncGroup) {
      if (!payload.sync_group) throw new Error('Desktop did not return Sync Group membership.');
      const existingGroup = await loadCompanionSyncGroup();
      const isActiveReauthorization = existingGroup?.group_id === payload.sync_group.group_id
        && existingGroup.timeline_id === payload.sync_group.timeline_id
        && existingGroup.local_device_id === payload.device_id
        && existingGroup.local_member_state === 'active';
      if (isActiveReauthorization) {
        await refreshActiveCompanionSyncGroupMembership({
          deviceId: payload.device_id, group: payload.sync_group
        });
      } else {
        await joinCompanionSyncGroup({
          deviceId: payload.device_id,
          emptyFacts: await loadCompanionSyncGroupLibraryFacts(),
          group: payload.sync_group
        });
      }
    }
    await verifyNativePairingCanSignRequest(normalizeEndpointUrl(args.endpointUrl));
    return storedPairingState;
  });
}

async function requestDesktop(
  url: string,
  init: { body?: string; headers?: Record<string, string>; method: string }
) {
  if (!isNativeCompanionPairingRuntime()) {
    return await fetch(url, init);
  }
  const payload = await FolioleCompanionSync.desktopHttpRequest({
    ...(init.body !== undefined ? { body: init.body } : {}),
    ...(init.headers !== undefined ? { headers: init.headers } : {}),
    method: init.method,
    url
  });
  return new Response(payload.body, { status: payload.status });
}

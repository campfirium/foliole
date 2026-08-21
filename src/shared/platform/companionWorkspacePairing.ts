import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../lib/platform/syncProtocolContract';

import {
  loadCompanionDiscoveryEndpoint,
  requestCompanionPairingEndpoint
} from './companion/network/companionPairingHttpRequest';
import {
  persistNativePairingCredentials,
  saveStandaloneNativePairing
} from './companion/network/nativePairingCredentialStore';
import {
  createSignedRequestHeaders,
  verifyNativePairingCanSignRequest
} from './companion/network/signedRequest';
import { projectCompanionSyncGroupPairingState } from './companion/sync/companionSyncGroupPairingState';
import {
  joinCompanionSyncGroup,
  loadCompanionSyncGroup,
  loadCompanionSyncGroupWorkgroupKey,
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
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
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
export { loadCompanionDiscoveryEndpoint as loadCompanionDiscovery };


export async function loadCompanionPairingState() {
  if (!isNativeCompanionPairingRuntime()) {
    return readWebPairingState();
  }
  const native = normalizePairingState(await FolioleCompanionSync.loadPairingState());
  const group = await loadCompanionSyncGroup().catch(() => null);
  const workgroupKey = group ? await loadCompanionSyncGroupWorkgroupKey().catch(() => null) : null;
  if (!group || !workgroupKey) return native;
  return projectCompanionSyncGroupPairingState(group, native);
}

export async function clearCompanionPairingCredentials() {
  if (!isNativeCompanionPairingRuntime()) {
    return clearWebPairingState();
  }
  return normalizePairingState(await runCompanionSyncWriterTask(() => FolioleCompanionSync.clearPairingCredentials()));
}

export { createSignedRequestHeaders };

export async function requestCompanionPairing(args: RequestCompanionPairingArgs) {
  const normalizedEndpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const usesSyncGroup = Boolean(args.groupId && args.groupTag);
  const existingGroup = usesSyncGroup ? await loadCompanionSyncGroup() : null;
  if (existingGroup && existingGroup.group_id !== args.groupId) {
    throw new Error('sync_group_identity_mismatch');
  }
  const pairingKeyId = createCompanionUuid();
  const pairingPublicKey = await createCompanionPairingPublicKey(pairingKeyId);
  const libraryFacts = usesSyncGroup ? await loadCompanionSyncGroupLibraryFacts() : null;
  const existingMember = existingGroup?.group_id === args.groupId
    ? existingGroup?.members.find((member) => member.host_name === existingGroup.local_host_name)
    : null;
  const response = await requestCompanionPairingEndpoint(`${normalizedEndpointUrl}${PAIR_REQUESTS_ENDPOINT_PATH}`, {
    body: JSON.stringify({
      host_name: existingMember?.host_name ?? args.hostName,
      host_platform: existingMember?.host_platform ?? args.hostPlatform,
      ...(usesSyncGroup ? {
        group_id: args.groupId,
        group_tag: args.groupTag,
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
  const usesSyncGroup = Boolean(args.groupId && args.groupTag);
  const normalizedEndpointUrl = normalizeEndpointUrl(args.endpointUrl);
  const response = await requestCompanionPairingEndpoint(`${normalizedEndpointUrl}${PAIR_ENDPOINT_PATH}`, {
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
  const credentialSecret = await decryptCompanionPairingSecret(pairingKeyId, payload.encrypted_credential_secret);
  const providerSecret = usesSyncGroup && payload.provider_encrypted_credential_secret
    ? await decryptCompanionPairingSecret(pairingKeyId, payload.provider_encrypted_credential_secret)
    : null;
  pairingKeyIdsByRequestId.delete(args.pairRequestId);
  if (!isNativeCompanionPairingRuntime()) {
    return writeWebPairingState({
      authorization_id: payload.authorization_id,
      credential_secret: credentialSecret,
      host_name: payload.host_name ?? args.hostName,
      host_platform: payload.host_platform ?? args.hostPlatform,
      is_paired: true,
      negotiated_protocol_version: payload.compatibility.negotiated_version,
      paired_at: payload.paired_at,
      remote_peer_id: payload.peer_id,
      remote_peer_name: args.remotePeerName ?? null,
      remote_peer_platform: args.remotePeerPlatform ?? null,
      remote_protocol: payload.desktop_protocol
    });
  }
  if (usesSyncGroup && !providerSecret) throw new Error('Sync Group provider pairing credentials are missing.');
  return saveNativePairing(args, payload, credentialSecret, providerSecret, usesSyncGroup);
}

async function saveNativePairing(
  args: PairCompanionWithDesktopArgs,
  payload: PairCompanionWithDesktopResponse,
  credentialSecret: string,
  providerSecret: string | null,
  usesSyncGroup: boolean
) {
  return runCompanionSyncWriterTask(async () => {
    if (usesSyncGroup) {
      if (!payload.sync_group || !payload.provider_authorization_id || !payload.host_name
        || !payload.provider_host_name || !payload.provider_host_platform) {
        throw new Error('Desktop did not return Sync Group membership.');
      }
      const existingGroup = await loadCompanionSyncGroup();
      const isActiveReauthorization = existingGroup?.group_id === payload.sync_group.group_id
        && existingGroup.timeline_id === payload.sync_group.timeline_id
        && existingGroup.local_host_name === payload.host_name
        && existingGroup.local_member_state === 'active';
      if (isActiveReauthorization) {
        await refreshActiveCompanionSyncGroupMembership({
          hostName: payload.host_name, group: payload.sync_group, workgroupKey: providerSecret!
        });
      } else {
        await joinCompanionSyncGroup({
          hostName: payload.host_name, group: payload.sync_group, workgroupKey: providerSecret!
        });
      }
      await FolioleCompanionSync.bindSyncGroupPeerRoute({
        endpoint_url: normalizeEndpointUrl(args.endpointUrl),
        local_authorization_id: payload.authorization_id,
        local_host_name: payload.host_name,
        peer_authorization_id: payload.provider_authorization_id,
        peer_host_name: payload.provider_host_name,
        peer_host_platform: payload.provider_host_platform,
        sync_group_id: payload.sync_group.group_id
      });
      await persistNativePairingCredentials(args, payload, credentialSecret);
      await verifyNativePairingCanSignRequest(normalizeEndpointUrl(args.endpointUrl));
      return loadCompanionPairingState();
    }
    return saveStandaloneNativePairing(args, payload, credentialSecret);
  });
}

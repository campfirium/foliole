import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import {
  discoverCompanionDesktops,
  type CompanionDiscoveryOptions
} from '../../companionWorkspaceDiscovery';
import { createSignedRequestHeaders, loadCompanionPairingState } from '../../companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

function activeRemoteMembers(group: SyncGroupPayload) {
  return group.members
    .filter((member) => member.state === 'active' && member.host_name !== group.local_host_name);
}

export interface CompanionWorkspaceSyncTarget {
  authorizationId?: string;
  hostName?: string;
  endpointUrl: string;
  groupId?: string;
}

export async function bindCompanionWorkspaceSyncTarget(target: CompanionWorkspaceSyncTarget) {
  if (!target.authorizationId || !target.hostName || !target.groupId || !isNativeCompanionPairingRuntime()) return;
  const group = await loadCompanionSyncGroup();
  if (!group || group.group_id !== target.groupId) throw new Error('sync_group_identity_mismatch');
  const localMember = group.members.find((member) => member.host_name === group.local_host_name);
  if (!localMember?.authorization_id) throw new Error('sync_group_local_authorization_missing');
  const peerMember = group.members.find((member) => member.host_name === target.hostName);
  if (!peerMember) throw new Error('sync_group_peer_host_unavailable');
  await FolioleCompanionSync.bindSyncGroupPeerRoute({
    endpoint_url: target.endpointUrl,
    local_authorization_id: localMember.authorization_id,
    local_host_name: group.local_host_name,
    peer_authorization_id: target.authorizationId,
    peer_host_name: target.hostName,
    peer_host_platform: peerMember.host_platform,
    sync_group_id: target.groupId
  });
}

export async function resolveReachableCompanionWorkspaceSyncEndpoints(
  endpointUrl: string,
  options: CompanionDiscoveryOptions = {}
) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (!isNativeCompanionPairingRuntime()) return [{ endpointUrl: normalizedEndpointUrl }];
  const group = await loadCompanionSyncGroup().catch(() => null);
  if (!group) {
    return [{ endpointUrl: await resolveReachableCompanionWorkspaceSyncEndpoint(normalizedEndpointUrl, options) }];
  }
  const discovered = await discoverCompanionDesktops(normalizedEndpointUrl, options).catch(() => []);
  return activeRemoteMembers(group).flatMap((member) => {
    const match = discovered.find((candidate) => candidate.compatibility.status === 'compatible'
      && candidate.discovery.group_id === group.group_id
      && candidate.discovery.peer_id === member.authorization_id);
    return match ? [{ authorizationId: match.discovery.peer_id, endpointUrl: match.endpointUrl,
      groupId: group.group_id, hostName: member.host_name }] : [];
  });
}

export async function resolveReachableCompanionWorkspaceSyncEndpoint(
  endpointUrl: string,
  options: CompanionDiscoveryOptions = {}
) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (!isNativeCompanionPairingRuntime()) {
    return normalizedEndpointUrl;
  }
  const pairing = await loadCompanionPairingState().catch(() => null);
  const remotePeerId = pairing?.remote_peer_id?.trim();
  if (!remotePeerId) return normalizedEndpointUrl;
  const discovered = await discoverCompanionDesktops(normalizedEndpointUrl, options).catch(() => []);
  const pairedDesktop = discovered.find((candidate) => candidate.discovery.peer_id === remotePeerId);
  return pairedDesktop?.endpointUrl ?? normalizedEndpointUrl;
}

export async function loadCompanionWorkspaceVersion(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const headers = await createSignedRequestHeaders({
    endpointUrl: normalizedEndpointUrl, method: 'GET', pathWithQuery: WORKSPACE_VERSION_PATH
  });
  if (isNativeCompanionPairingRuntime()) {
    const response = await FolioleCompanionSync.desktopHttpRequest({
      headers,
      method: 'GET',
      url: `${normalizedEndpointUrl}${WORKSPACE_VERSION_PATH}`
    });
    if (response.status >= 400) throw new Error(`Desktop sync source returned ${response.status}.`);
    return JSON.parse(response.body) as CompanionWorkspaceVersionPayload;
  }
  const response = await fetch(`${normalizedEndpointUrl}${WORKSPACE_VERSION_PATH}`, { headers });
  if (!response.ok) throw new Error(`Desktop sync source returned ${response.status}.`);
  return (await response.json()) as CompanionWorkspaceVersionPayload;
}

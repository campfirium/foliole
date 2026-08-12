import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import type { SyncGroupPayload } from '../../../../../lib/platform/syncGroupContract';
import { discoverCompanionDesktops } from '../../companionWorkspaceDiscovery';
import { createSignedRequestHeaders, loadCompanionPairingState } from '../../companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

function activeRemoteDeviceIds(group: SyncGroupPayload) {
  return group.members
    .filter((member) => member.state === 'active' && member.device_id !== group.local_device_id)
    .map((member) => member.device_id);
}

export interface CompanionWorkspaceSyncTarget {
  deviceId?: string;
  endpointUrl: string;
  groupId?: string;
}

export async function bindCompanionWorkspaceSyncTarget(target: CompanionWorkspaceSyncTarget) {
  if (!target.deviceId || !target.groupId || !isNativeCompanionPairingRuntime()) return;
  await FolioleCompanionSync.bindSyncGroupPeerRoute({
    endpoint_url: target.endpointUrl,
    peer_device_id: target.deviceId,
    sync_group_id: target.groupId
  });
}

export async function resolveReachableCompanionWorkspaceSyncEndpoints(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (!isNativeCompanionPairingRuntime()) return [{ endpointUrl: normalizedEndpointUrl }];
  const group = await loadCompanionSyncGroup().catch(() => null);
  if (!group) return [{ endpointUrl: await resolveReachableCompanionWorkspaceSyncEndpoint(normalizedEndpointUrl) }];
  const discovered = await discoverCompanionDesktops(normalizedEndpointUrl).catch(() => []);
  return activeRemoteDeviceIds(group).flatMap((deviceId) => {
    const match = discovered.find((candidate) => candidate.compatibility.status === 'compatible'
      && candidate.discovery.group_id === group.group_id
      && candidate.discovery.timeline_id === group.timeline_id
      && candidate.discovery.peer_id === deviceId);
    return match ? [{ deviceId, endpointUrl: match.endpointUrl, groupId: group.group_id }] : [];
  });
}

export async function resolveReachableCompanionWorkspaceSyncEndpoint(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (!isNativeCompanionPairingRuntime()) {
    return normalizedEndpointUrl;
  }
  const pairing = await loadCompanionPairingState().catch(() => null);
  const remotePeerId = pairing?.remote_peer_id?.trim();
  if (!remotePeerId) return normalizedEndpointUrl;
  const discovered = await discoverCompanionDesktops(normalizedEndpointUrl).catch(() => []);
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

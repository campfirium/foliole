import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { resolveRemoteSyncGroupDevices } from '../../../../../lib/platform/syncGroupContract';
import {
  discoverCompanionDesktops,
  loadCompanionDiscoveryCandidates,
  type CompanionDiscoveryOptions
} from '../../companionWorkspaceDiscovery';
import {
  FolioleCompanionSync,
  isNativeCompanionNetworkRuntime,
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

import { createSignedRequestHeaders } from './signedRequest';

export interface CompanionWorkspaceSyncTarget {
  deviceId?: string;
  deviceName?: string;
  endpointUrl: string;
  groupId?: string;
}

async function resolvePreferredGroupTarget(
  endpointUrl: string,
  groupId: string,
  device: ReturnType<typeof resolveRemoteSyncGroupDevices>[number]
) {
  const [preferred] = await loadCompanionDiscoveryCandidates([{
    endpointUrl,
    protocolTxt: null,
    source: 'direct'
  }]).catch(() => []);
  if (preferred?.compatibility.status !== 'compatible' || preferred.discovery.group_id !== groupId ||
    preferred.discovery.provider_device_id !== device.device_identity_key) return null;
  return {
    deviceId: device.device_identity_key,
    deviceName: device.device_name,
    endpointUrl: preferred.endpointUrl,
    groupId
  } satisfies CompanionWorkspaceSyncTarget;
}

export async function bindCompanionWorkspaceSyncTarget(target: CompanionWorkspaceSyncTarget) {
  const group = await loadCompanionSyncGroup();
  if (target.groupId && group?.group_id !== target.groupId) throw new Error('sync_group_identity_mismatch');
}

export async function resolveReachableCompanionWorkspaceSyncEndpoints(
  endpointUrl: string,
  options: CompanionDiscoveryOptions = {}
) {
  const normalized = normalizeEndpointUrl(endpointUrl);
  const group = await loadCompanionSyncGroup().catch(() => null);
  if (!group || !isNativeCompanionNetworkRuntime()) return [{ endpointUrl: normalized }];
  const remoteDevices = resolveRemoteSyncGroupDevices(group);
  if (remoteDevices.length === 0) {
    return [{ endpointUrl: normalized, groupId: group.group_id }];
  }
  if (remoteDevices.length === 1) {
    const preferred = await resolvePreferredGroupTarget(normalized, group.group_id, remoteDevices[0]!);
    if (preferred) return [preferred];
  }
  const discovered = await discoverCompanionDesktops(normalized, options).catch(() => []);
  return remoteDevices.flatMap((device) => {
    const match = discovered.find((candidate) => candidate.compatibility.status === 'compatible'
      && candidate.discovery.group_id === group.group_id
      && candidate.discovery.provider_device_id === device.device_identity_key);
    return match ? [{ deviceId: device.device_identity_key, deviceName: device.device_name,
      endpointUrl: match.endpointUrl, groupId: group.group_id }] : [];
  });
}

export async function resolveReachableCompanionWorkspaceSyncEndpoint(
  endpointUrl: string,
  options: CompanionDiscoveryOptions = {}
) {
  return (await resolveReachableCompanionWorkspaceSyncEndpoints(endpointUrl, options))[0]?.endpointUrl
    ?? normalizeEndpointUrl(endpointUrl);
}

export async function loadCompanionWorkspaceVersion(endpointUrl: string) {
  const normalized = normalizeEndpointUrl(endpointUrl);
  const headers = await createSignedRequestHeaders({
    endpointUrl: normalized, method: 'GET', pathWithQuery: WORKSPACE_VERSION_PATH
  });
  if (isNativeCompanionNetworkRuntime()) {
    const response = await FolioleCompanionSync.desktopHttpRequest({
      headers, method: 'GET', url: `${normalized}${WORKSPACE_VERSION_PATH}`
    });
    if (response.status >= 400) throw new Error(`Sync source returned ${response.status}.`);
    return JSON.parse(response.body) as CompanionWorkspaceVersionPayload;
  }
  const response = await fetch(`${normalized}${WORKSPACE_VERSION_PATH}`, { headers });
  if (!response.ok) throw new Error(`Sync source returned ${response.status}.`);
  return await response.json() as CompanionWorkspaceVersionPayload;
}

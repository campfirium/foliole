import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { isDesktopSyncGroupPlatform } from '../../../../../lib/platform/syncGroupPlatform';
import { discoverCompanionDesktops, type CompanionDiscoveryOptions } from '../../companionWorkspaceDiscovery';
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
  const discovered = await discoverCompanionDesktops(normalized, options);
  const match = discovered.find((candidate) => {
    const known = group.devices.find((device) =>
      device.device_identity_key === candidate.discovery.provider_device_id);
    return candidate.compatibility.status === 'compatible'
      && candidate.discovery.group_id === group.group_id
      && isDesktopSyncGroupPlatform(candidate.discovery.provider_platform ?? known?.platform ?? '')
      && candidate.discovery.provider_device_id !== group.local_device_identity_key;
  });
  if (!match) {
    const incompatible = discovered.some((candidate) => candidate.compatibility.status === 'incompatible'
      && candidate.discovery.group_id === group.group_id);
    throw new Error(incompatible ? 'discovery_incompatible' : 'discovery_waiting_anchor');
  }
  const known = group.devices.find((device) =>
    device.device_identity_key === match.discovery.provider_device_id);
  return [{ deviceId: match.discovery.provider_device_id,
    deviceName: match.discovery.provider_device_name ?? known?.device_name ?? match.discovery.provider_device_id,
    endpointUrl: match.endpointUrl, groupId: group.group_id }];
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

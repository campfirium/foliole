import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { isMobileSyncPlatform } from '../../../../../lib/platform/syncSchedulingPlatform.js';
import { discoverCompanionDesktops, type CompanionDiscoveryOptions } from '../../companionWorkspaceDiscovery';
import {
  FolioleCompanionSync,
  isNativeCompanionNetworkRuntime,
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from '../../companionWorkspaceRuntimeRepository';
import { loadCompanionSyncGroup } from '../sync/syncGroupStore';

import { companionDesktopSessionPeer, companionDesktopSessionTarget } from './companionDesktopSession.js';
import { createSignedRequestHeaders } from './signedRequest';

export interface CompanionWorkspaceSyncTarget {
  platform?: string;
  deviceId?: string;
  deviceName?: string;
  endpointUrl: string;
  groupId?: string;
  protocolVersion?: number;
  protocolIncompatible?: boolean;
}

export async function bindCompanionWorkspaceSyncTarget(target: CompanionWorkspaceSyncTarget) {
  const group = await loadCompanionSyncGroup();
  if (target.groupId && group?.group_id !== target.groupId) throw new Error('sync_group_identity_mismatch');
}

export async function resolveReachableCompanionWorkspaceSyncEndpoints(
  endpointUrl: string,
  options: CompanionDiscoveryOptions & { mobilePeersOnly?: boolean; onSessionReused?(): void } = {}
): Promise<CompanionWorkspaceSyncTarget[]> {
  const normalized = normalizeEndpointUrl(endpointUrl);
  const group = await loadCompanionSyncGroup().catch(() => null);
  if (!isNativeCompanionNetworkRuntime()) return [{ endpointUrl: normalized }];
  if (!group) return [];
  const active = companionDesktopSessionTarget(group.group_id);
  if (active && !options.mobilePeersOnly) {
    options.onSessionReused?.();
    return [active];
  }
  const discovered = await discoverCompanionDesktops(normalized, {
    ...options, fastDesktop: !options.mobilePeersOnly, requiredGroupId: group.group_id
  });
  const matches = discovered.filter((candidate) => {
    return candidate.compatibility.status === 'compatible'
      && candidate.discovery.group_id === group.group_id
      && candidate.discovery.provider_device_id !== group.local_device_identity_key;
  });
  if (matches.length === 0 && options.mobilePeersOnly) return [];
  if (matches.length === 0) {
    const incompatible = discovered.some((candidate) => candidate.compatibility.status === 'incompatible'
      && candidate.discovery.group_id === group.group_id);
    throw new Error(incompatible ? 'discovery_incompatible' : 'discovery_no_devices');
  }
  const incompatiblePeers = discovered.filter(candidate => candidate.compatibility.status === 'incompatible'
    && candidate.discovery.group_id === group.group_id
    && candidate.discovery.provider_device_id !== group.local_device_identity_key);
  const desktops = matches.filter(match => !isMobileSyncPlatform(match.discovery.provider_platform ?? ''));
  const selected = desktops.find(match => match.discovery.provider_device_id === companionDesktopSessionPeer()) ?? desktops[0];
  const mobiles = matches.filter(match => isMobileSyncPlatform(match.discovery.provider_platform ?? ''));
  const targets = selected && !options.mobilePeersOnly ? [selected, ...mobiles] : mobiles;
  const incompatibleTargets = incompatiblePeers.filter(match => (!selected && !options.mobilePeersOnly)
    || isMobileSyncPlatform(match.discovery.provider_platform ?? ''));
  return [...targets, ...incompatibleTargets].map((match) => {
    const known = group.devices.find((device) =>
      device.device_identity_key === match.discovery.provider_device_id);
    return { deviceId: match.discovery.provider_device_id, platform: match.discovery.provider_platform,
      deviceName: match.discovery.provider_device_name ?? known?.device_name
        ?? match.discovery.provider_device_id,
      endpointUrl: match.endpointUrl, groupId: group.group_id,
      ...(match.compatibility.status === 'incompatible' ? { protocolIncompatible: true } : {}),
      ...(match.compatibility.negotiated_version
        ? { protocolVersion: match.compatibility.negotiated_version }
        : {}) };
  });
}

export async function resolveReachableCompanionWorkspaceSyncEndpoint(
  endpointUrl: string,
  options: CompanionDiscoveryOptions & { mobilePeersOnly?: boolean; onSessionReused?(): void } = {}
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

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import type { SyncProtocolCompatibilityResult } from '../../lib/platform/syncProtocolContract';

export const UNKNOWN_DESKTOP_PLATFORM = '';
export const UNKNOWN_DESKTOP_VERSION = '';

export type CompanionDesktopDiscovery = {
  appVersion: string;
  desktopHostName: string;
  desktopName: string;
  desktopPlatform: string;
  compatibility: SyncProtocolCompatibilityResult;
  endpointUrl: string;
  peerId: string;
  groupDisplayName?: string;
  groupId?: string | undefined;
  groupTag?: string | undefined;
  timelineId?: string | undefined;
};

export type PendingPairRequest = {
  endpointUrl: string;
  expiresAt: string;
  pairRequestId: string;
  remotePeerId: string;
  remotePeerName: string;
  remotePeerPlatform: string;
  groupId?: string | undefined;
  groupTag?: string | undefined;
  timelineId?: string | undefined;
} | null;

export function resolveCompanionHostName(bootstrapState: NativeCompanionBootstrapState) {
  return bootstrapState.host_name?.trim() || (bootstrapState.runtime_kind === 'ios-capacitor' ? 'iPhone' : 'Android');
}

export function normalizeDiscovery(endpointUrl: string, discovery: {
  app_version?: string;
  desktop_host_name?: string;
  desktop_name: string;
  desktop_platform?: string;
  peer_id: string;
  group_display_name: string;
  group_id: string;
  group_tag: string;
  timeline_id: string;
}, compatibility: SyncProtocolCompatibilityResult) {
  return {
    appVersion: discovery.app_version?.trim() || UNKNOWN_DESKTOP_VERSION,
    desktopHostName: discovery.desktop_host_name?.trim() || discovery.desktop_name,
    desktopName: discovery.desktop_name,
    desktopPlatform: discovery.desktop_platform?.trim() || UNKNOWN_DESKTOP_PLATFORM,
    compatibility,
    endpointUrl: endpointUrl.trim(),
    peerId: discovery.peer_id,
    groupDisplayName: discovery.group_display_name,
    groupId: discovery.group_id,
    groupTag: discovery.group_tag,
    timelineId: discovery.timeline_id
  };
}

export function mergeSelectedDiscovery(
  discoveries: CompanionDesktopDiscovery[],
  selectedDiscovery: CompanionDesktopDiscovery
) {
  if (discoveries.length === 0) return [selectedDiscovery];
  const selectedKey = selectedDiscovery.peerId || selectedDiscovery.endpointUrl;
  let matched = false;
  const nextDiscoveries = discoveries.map((discovery) => {
    const discoveryKey = discovery.peerId || discovery.endpointUrl;
    const shouldReplace = discoveryKey === selectedKey || discovery.endpointUrl === selectedDiscovery.endpointUrl;
    matched = matched || shouldReplace;
    return shouldReplace ? selectedDiscovery : discovery;
  });
  return matched ? nextDiscoveries : [...nextDiscoveries, selectedDiscovery];
}

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';

export type CompanionDesktopDiscovery = {
  appVersion: string;
  desktopDeviceName: string;
  desktopName: string;
  desktopPlatform: string;
  endpointUrl: string;
  hostName: string;
  peerId: string;
};

export type PendingPairRequest = {
  endpointUrl: string;
  expiresAt: string;
  pairRequestId: string;
} | null;

export function createCompanionDeviceName(bootstrapState: NativeCompanionBootstrapState) {
  const normalizedName = bootstrapState.device_name?.trim();
  if (normalizedName) return normalizedName;
  return bootstrapState.runtime_kind === 'android-capacitor' ? 'Android device' : 'Web preview';
}

export function normalizeDiscovery(endpointUrl: string, discovery: {
  app_version?: string;
  desktop_device_name?: string;
  desktop_name: string;
  desktop_platform?: string;
  host_name?: string;
  peer_id: string;
}) {
  return {
    appVersion: discovery.app_version?.trim() || 'Unknown version',
    desktopDeviceName: discovery.desktop_device_name?.trim() || discovery.desktop_name,
    desktopName: discovery.desktop_name,
    desktopPlatform: discovery.desktop_platform?.trim() || 'Desktop',
    endpointUrl: endpointUrl.trim(),
    hostName: discovery.host_name?.trim() || 'Unknown host',
    peerId: discovery.peer_id
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

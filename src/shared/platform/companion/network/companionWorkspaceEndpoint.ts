import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { discoverCompanionDesktops } from '../../companionWorkspaceDiscovery';
import { createSignedRequestHeaders, loadCompanionPairingState } from '../../companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from '../../companionWorkspaceRuntimeRepository';

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
  const headers = await createSignedRequestHeaders({ method: 'GET', pathWithQuery: WORKSPACE_VERSION_PATH });
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

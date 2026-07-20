import type { CompanionWorkspaceVersionPayload } from '../../../../../lib/platform/nativeCompanionSyncContract';
import { discoverCompanionDesktop } from '../../companionWorkspaceDiscovery';
import { createSignedRequestHeaders } from '../../companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  normalizeEndpointUrl,
  WORKSPACE_VERSION_PATH
} from '../../companionWorkspaceRuntimeRepository';

function isLocalDevelopmentEndpoint(endpointUrl: string) {
  try {
    const host = new URL(normalizeEndpointUrl(endpointUrl)).hostname;
    return host === '10.0.2.2' || host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

export async function resolveReachableCompanionWorkspaceSyncEndpoint(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  if (!isNativeCompanionPairingRuntime() || !isLocalDevelopmentEndpoint(normalizedEndpointUrl)) {
    return normalizedEndpointUrl;
  }
  const discovered = await discoverCompanionDesktop(normalizedEndpointUrl).catch(() => null);
  return discovered?.endpointUrl ?? normalizedEndpointUrl;
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

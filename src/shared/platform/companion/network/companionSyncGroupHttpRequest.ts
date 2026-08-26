import {
  DISCOVERY_ENDPOINT_PATH,
  FolioleCompanionSync,
  isNativeCompanionNetworkRuntime,
  type LoadCompanionDiscoveryResponse,
  normalizeEndpointUrl
} from '../../companionWorkspaceRuntimeRepository';

export async function loadCompanionDiscoveryEndpoint(endpointUrl: string) {
  const normalized = normalizeEndpointUrl(endpointUrl);
  const response = await requestCompanionSyncGroupEndpoint(
    `${normalized}${DISCOVERY_ENDPOINT_PATH}`, { method: 'GET' });
  if (!response.ok) throw new Error(`Sync Group discovery failed with ${response.status}.`);
  return await response.json() as LoadCompanionDiscoveryResponse;
}

export async function requestCompanionSyncGroupEndpoint(
  url: string,
  init: { body?: string; headers?: Record<string, string>; method: string }
) {
  if (!isNativeCompanionNetworkRuntime()) return fetch(url, init);
  const payload = await FolioleCompanionSync.desktopHttpRequest({
    ...(init.body !== undefined ? { body: init.body } : {}),
    ...(init.headers !== undefined ? { headers: init.headers } : {}),
    method: init.method,
    url
  });
  return new Response(payload.body, { status: payload.status });
}

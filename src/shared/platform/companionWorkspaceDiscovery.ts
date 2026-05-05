import {
  DISCOVERY_ENDPOINT_PATH,
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime,
  type LoadCompanionDiscoveryResponse,
  normalizeEndpointUrl
} from './companionWorkspaceSyncBridge';

export type CompanionDiscoveryResult = {
  discovery: LoadCompanionDiscoveryResponse;
  endpointUrl: string;
};

const DEV_REVERSE_ENDPOINT = 'http://127.0.0.1:38641';
const ANDROID_EMULATOR_ENDPOINT = 'http://10.0.2.2:38641';
const DISCOVERY_TIMEOUT_MS = 1200;
const DISCOVERY_BATCH_SIZE = 24;

function uniqueEndpoints(endpointUrls: string[]) {
  return [...new Set(endpointUrls.map((url) => normalizeEndpointUrl(url)).filter(Boolean))];
}

function createDiscoveryTimeout() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  return { controller, timeoutId };
}

async function loadNativeDiscoveryCandidateUrls(preferredEndpointUrl: string) {
  if (!isNativeAndroidCompanionRuntime()) {
    return uniqueEndpoints([preferredEndpointUrl]);
  }
  try {
    const payload = await FolioleCompanionSync.loadDiscoveryCandidates();
    return uniqueEndpoints([preferredEndpointUrl, DEV_REVERSE_ENDPOINT, ANDROID_EMULATOR_ENDPOINT, ...(payload.endpoint_urls ?? [])]);
  } catch {
    return uniqueEndpoints([preferredEndpointUrl, DEV_REVERSE_ENDPOINT, ANDROID_EMULATOR_ENDPOINT]);
  }
}

async function tryLoadCompanionDiscovery(endpointUrl: string): Promise<CompanionDiscoveryResult | null> {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const { controller, timeoutId } = createDiscoveryTimeout();
  try {
    const response = await fetch(`${normalizedEndpointUrl}${DISCOVERY_ENDPOINT_PATH}`, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return {
      discovery: (await response.json()) as LoadCompanionDiscoveryResponse,
      endpointUrl: normalizedEndpointUrl
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getDiscoveryKey(result: CompanionDiscoveryResult) {
  return result.discovery.peer_id?.trim() || result.endpointUrl;
}

function appendUniqueDiscovery(results: CompanionDiscoveryResult[], result: CompanionDiscoveryResult) {
  const key = getDiscoveryKey(result);
  if (!results.some((current) => getDiscoveryKey(current) === key)) {
    results.push(result);
  }
}

export async function discoverCompanionDesktops(preferredEndpointUrl: string): Promise<CompanionDiscoveryResult[]> {
  const candidates = await loadNativeDiscoveryCandidateUrls(preferredEndpointUrl);
  const discovered: CompanionDiscoveryResult[] = [];
  for (let index = 0; index < candidates.length; index += DISCOVERY_BATCH_SIZE) {
    const batch = candidates.slice(index, index + DISCOVERY_BATCH_SIZE);
    const results = await Promise.all(batch.map((endpointUrl) => tryLoadCompanionDiscovery(endpointUrl)));
    results.forEach((result) => {
      if (result) {
        appendUniqueDiscovery(discovered, result);
      }
    });
  }
  if (discovered.length === 0) {
    throw new Error('No desktop sync device found. Make sure desktop Sync is on and both devices are on the same Wi-Fi.');
  }
  return discovered;
}

export async function discoverCompanionDesktop(preferredEndpointUrl: string): Promise<CompanionDiscoveryResult> {
  const results = await discoverCompanionDesktops(preferredEndpointUrl);
  const [firstResult] = results;
  if (!firstResult) {
    throw new Error('No desktop sync device found. Make sure desktop Sync is on and both devices are on the same Wi-Fi.');
  }
  return firstResult;
}

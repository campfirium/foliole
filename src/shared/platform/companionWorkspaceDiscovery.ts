import {
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolTxt,
  syncProtocolVersionHintMatchesDescriptor,
  type SyncProtocolCompatibilityResult
} from '../../../lib/platform/syncProtocolContract';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  DISCOVERY_ENDPOINT_PATH,
  FolioleCompanionSync,
  isNativeCompanionNetworkRuntime,
  type LoadCompanionDiscoveryResponse,
  normalizeEndpointUrl
} from './companionWorkspaceRuntimeRepository';

export type CompanionDiscoveryResult = {
  compatibility: SyncProtocolCompatibilityResult;
  discovery: LoadCompanionDiscoveryResponse;
  endpointUrl: string;
};

export type CompanionDiscoveryOptions = {
  allowWhileNotParticipating?: boolean;
};

export type DiscoveryCandidate = {
  endpointUrl: string;
  protocolTxt: Record<string, string> | null;
  source: 'direct' | 'nsd';
};

const DEV_REVERSE_ENDPOINT = 'http://127.0.0.1:38641';
const DISCOVERY_TIMEOUT_MS = 1200;
const DISCOVERY_BATCH_SIZE = 24;

function directCandidate(endpointUrl: string): DiscoveryCandidate {
  return { endpointUrl: normalizeEndpointUrl(endpointUrl), protocolTxt: null, source: 'direct' };
}

function uniqueCandidates(candidates: DiscoveryCandidate[]) {
  const byEndpoint = new Map<string, DiscoveryCandidate>();
  candidates.forEach((candidate) => {
    const endpointUrl = normalizeEndpointUrl(candidate.endpointUrl);
    if (!endpointUrl) return;
    const current = byEndpoint.get(endpointUrl);
    if (!current || candidate.source === 'nsd') byEndpoint.set(endpointUrl, { ...candidate, endpointUrl });
  });
  return [...byEndpoint.values()];
}

function createDiscoveryTimeout() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  return { controller, timeoutId };
}

async function loadNativeDiscoveryCandidates(
  preferredEndpointUrl: string,
  options: CompanionDiscoveryOptions
) {
  if (!isNativeCompanionNetworkRuntime()) {
    return uniqueCandidates([directCandidate(preferredEndpointUrl)]);
  }
  if (!options.allowWhileNotParticipating) {
    const participation = await FolioleCompanionSync.loadSyncParticipationState().catch(() => null);
    if (participation?.sync_enabled !== true || participation.sync_paused) return [];
  }
  const runtime = getCompanionRuntimeCapability();
  const direct = runtime.kind === 'android-native'
    ? [directCandidate(preferredEndpointUrl), directCandidate(DEV_REVERSE_ENDPOINT)]
    : runtime.kind === 'ios-native' ? [directCandidate(preferredEndpointUrl)] : [];
  try {
    const payload = await FolioleCompanionSync.loadDiscoveryCandidates();
    const native = (payload.candidates ?? [])
      .filter((candidate) => !isMobileProvider(candidate.protocol_txt))
      .map((candidate) => ({
        endpointUrl: candidate.endpoint_url,
        protocolTxt: candidate.protocol_txt ?? null,
        source: candidate.source
      }));
    return uniqueCandidates([...direct, ...native]);
  } catch {
    return uniqueCandidates(direct);
  }
}

function resolveCompatibility(candidate: DiscoveryCandidate, discovery: LoadCompanionDiscoveryResponse) {
  const compatibility = evaluateSyncProtocolCompatibility(discovery.protocol);
  if (compatibility.status === 'incompatible' || candidate.source !== 'nsd') return compatibility;
  const advertised = parseSyncProtocolTxt(candidate.protocolTxt);
  if (!advertised || !syncProtocolVersionHintMatchesDescriptor(advertised, discovery.protocol)) {
    return {
      missing_capabilities: [],
      negotiated_version: null,
      reason: 'protocol_advertisement_mismatch',
      status: 'incompatible'
    } satisfies SyncProtocolCompatibilityResult;
  }
  return compatibility;
}

async function tryLoadCompanionDiscovery(candidate: DiscoveryCandidate): Promise<CompanionDiscoveryResult | null> {
  const normalizedEndpointUrl = normalizeEndpointUrl(candidate.endpointUrl);
  const { controller, timeoutId } = createDiscoveryTimeout();
  try {
    const response = await requestDiscovery(`${normalizedEndpointUrl}${DISCOVERY_ENDPOINT_PATH}`, controller.signal);
    if (!response.ok) {
      return null;
    }
    const discovery = (await response.json()) as LoadCompanionDiscoveryResponse;
    return {
      compatibility: resolveCompatibility(candidate, discovery),
      discovery,
      endpointUrl: normalizedEndpointUrl
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadCompanionDiscoveryCandidates(candidates: DiscoveryCandidate[]) {
  const discovered: CompanionDiscoveryResult[] = [];
  for (let index = 0; index < candidates.length; index += DISCOVERY_BATCH_SIZE) {
    const batch = candidates.slice(index, index + DISCOVERY_BATCH_SIZE);
    const results = await Promise.all(batch.map((candidate) => tryLoadCompanionDiscovery(candidate)));
    results.forEach((result) => { if (result) appendUniqueDiscovery(discovered, result); });
  }
  return discovered;
}

async function requestDiscovery(url: string, signal: AbortSignal) {
  if (!isNativeCompanionNetworkRuntime()) {
    return await fetch(url, { signal });
  }
  const payload = await abortableNativeDiscoveryRequest(url, signal);
  return new Response(payload.body, { status: payload.status });
}

function abortableNativeDiscoveryRequest(url: string, signal: AbortSignal) {
  return new Promise<Awaited<ReturnType<typeof FolioleCompanionSync.desktopHttpRequest>>>((resolve, reject) => {
    const abort = () => reject(new DOMException('Discovery request timed out.', 'AbortError'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    void FolioleCompanionSync.desktopHttpRequest({ method: 'GET', url })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

function isMobileProvider(protocolTxt: Record<string, string> | null | undefined) {
  return ['android-capacitor', 'ios-capacitor'].includes(protocolTxt?.provider_platform ?? '');
}

function getDiscoveryKey(result: CompanionDiscoveryResult) {
  const groupId = result.discovery.group_id?.trim();
  const deviceId = result.discovery.provider_device_id?.trim();
  if (groupId && deviceId) return `group:${groupId}:device:${deviceId}`;
  return result.discovery.runtime_instance_id?.trim() || deviceId || result.endpointUrl;
}

function appendUniqueDiscovery(results: CompanionDiscoveryResult[], result: CompanionDiscoveryResult) {
  const key = getDiscoveryKey(result);
  const existingIndex = results.findIndex((current) => getDiscoveryKey(current) === key);
  if (existingIndex < 0) return void results.push(result);
  if (providerRank(result) < providerRank(results[existingIndex]!)) results[existingIndex] = result;
}

function providerRank(result: CompanionDiscoveryResult) {
  return result.discovery.provider_platform === 'android-capacitor' ? 1 : 0;
}

export async function discoverCompanionDesktops(
  preferredEndpointUrl: string,
  options: CompanionDiscoveryOptions = {}
): Promise<CompanionDiscoveryResult[]> {
  const candidates = await loadNativeDiscoveryCandidates(preferredEndpointUrl, options);
  return loadCompanionDiscoveryCandidates(candidates);
}

export async function discoverCompanionDesktop(
  preferredEndpointUrl: string,
  options: CompanionDiscoveryOptions = {}
): Promise<CompanionDiscoveryResult> {
  const results = await discoverCompanionDesktops(preferredEndpointUrl, options);
  const [firstResult] = results;
  if (!firstResult) {
    throw new Error('No desktop sync device found. Make sure desktop Sync is on and both devices are on the same Wi-Fi.');
  }
  return firstResult;
}

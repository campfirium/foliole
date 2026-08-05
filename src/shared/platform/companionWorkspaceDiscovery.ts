import {
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolTxt,
  syncProtocolDescriptorsMatch,
  type SyncProtocolCompatibilityResult
} from '../../../lib/platform/syncProtocolContract';

import { getCompanionRuntimeCapability } from './companionRuntimeCapabilities';
import {
  DISCOVERY_ENDPOINT_PATH,
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime,
  type LoadCompanionDiscoveryResponse,
  normalizeEndpointUrl
} from './companionWorkspaceRuntimeRepository';

export type CompanionDiscoveryResult = {
  compatibility: SyncProtocolCompatibilityResult;
  discovery: LoadCompanionDiscoveryResponse;
  endpointUrl: string;
};

type DiscoveryCandidate = {
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

async function loadNativeDiscoveryCandidates(preferredEndpointUrl: string) {
  if (!isNativeCompanionPairingRuntime()) {
    return uniqueCandidates([directCandidate(preferredEndpointUrl)]);
  }
  const runtime = getCompanionRuntimeCapability();
  const direct = runtime.kind === 'android-native'
    ? [directCandidate(preferredEndpointUrl), directCandidate(DEV_REVERSE_ENDPOINT)]
    : [];
  try {
    const payload = await FolioleCompanionSync.loadDiscoveryCandidates();
    const native = (payload.candidates ?? []).map((candidate) => ({
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
  if (!advertised || !syncProtocolDescriptorsMatch(advertised, discovery.protocol)) {
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

async function requestDiscovery(url: string, signal: AbortSignal) {
  if (!isNativeCompanionPairingRuntime()) {
    return await fetch(url, { signal });
  }
  const payload = await FolioleCompanionSync.desktopHttpRequest({ method: 'GET', url });
  return new Response(payload.body, { status: payload.status });
}

function getDiscoveryKey(result: CompanionDiscoveryResult) {
  return result.discovery.peer_id?.trim() || result.endpointUrl;
}

function appendUniqueDiscovery(results: CompanionDiscoveryResult[], result: CompanionDiscoveryResult) {
  const key = getDiscoveryKey(result);
  const existingIndex = results.findIndex((current) => getDiscoveryKey(current) === key);
  if (existingIndex < 0) {
    results.push(result);
    return;
  }
  if (result.endpointUrl === DEV_REVERSE_ENDPOINT) {
    results[existingIndex] = result;
  }
}

export async function discoverCompanionDesktops(preferredEndpointUrl: string): Promise<CompanionDiscoveryResult[]> {
  const candidates = await loadNativeDiscoveryCandidates(preferredEndpointUrl);
  const discovered: CompanionDiscoveryResult[] = [];
  for (let index = 0; index < candidates.length; index += DISCOVERY_BATCH_SIZE) {
    const batch = candidates.slice(index, index + DISCOVERY_BATCH_SIZE);
    const results = await Promise.all(batch.map((candidate) => tryLoadCompanionDiscovery(candidate)));
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

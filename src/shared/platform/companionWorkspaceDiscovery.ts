import {
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolTxt,
  syncProtocolVersionHintMatchesDescriptor,
  type SyncProtocolCompatibilityResult
} from '../../../lib/platform/syncProtocolContract';

import {
  companionPeerAdvertisements,
  waitForCompanionDesktopAdvertisements
} from './companion/companionDesktopDiscoveryWait';
import { requestNativeDiscovery } from './companion/network/companionDiscoveryHttp';
import { discoverReachableDesktop } from './companion/network/companionFastDiscovery';
import { withCompanionRequestSyncLifecycle } from './companion/sync/framed/companionRequestSyncLifecycle';
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
  requiredGroupId?: string;
  fastDesktop?: boolean;
  onDiscoveryShortened?(): void;
  signal?: AbortSignal;
};

export type DiscoveryCandidate = {
  endpointUrl: string;
  protocolTxt: Record<string, string> | null;
  source: 'direct' | 'nsd';
};

export type CompanionDiscoveryFailure = { endpointUrl: string } & (
  | { kind: 'http'; status: number }
  | { kind: 'request' | 'parse'; message: string }
);
type DiscoveryFailureReporter = (failure: CompanionDiscoveryFailure) => void;

const DISCOVERY_TIMEOUT_MS = 5000;
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
  try {
    const payload = await FolioleCompanionSync.loadDiscoveryCandidates();
    const immediate = companionPeerAdvertisements(payload, options.requiredGroupId);
    const discovered = immediate.length > 0
      ? immediate
      : await waitForCompanionDesktopAdvertisements(
        FolioleCompanionSync, undefined, options.requiredGroupId
      );
    const native = discovered
      .map((candidate) => ({
        endpointUrl: candidate.endpoint_url,
        protocolTxt: candidate.protocol_txt ?? null,
        source: candidate.source
      }));
    return uniqueCandidates(native);
  } catch {
    return [];
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
  const identityMatches = candidate.protocolTxt?.group_id === discovery.group_id
    && candidate.protocolTxt?.group_tag === discovery.group_tag
    && candidate.protocolTxt?.device_id === discovery.provider_device_id;
  return identityMatches ? compatibility : {
    missing_capabilities: [],
    negotiated_version: null,
    reason: 'protocol_advertisement_mismatch',
    status: 'incompatible'
  } satisfies SyncProtocolCompatibilityResult;
}

async function tryLoadCompanionDiscovery(
  candidate: DiscoveryCandidate, signal?: AbortSignal, onFailure?: DiscoveryFailureReporter
): Promise<CompanionDiscoveryResult | null> {
  const normalizedEndpointUrl = normalizeEndpointUrl(candidate.endpointUrl);
  const { controller, timeoutId } = createDiscoveryTimeout();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let stage: 'request' | 'parse' = 'request';
  try {
    const response = signal && isNativeCompanionNetworkRuntime()
      ? await requestNativeDiscovery(`${normalizedEndpointUrl}${DISCOVERY_ENDPOINT_PATH}`, controller.signal)
        .then(payload => new Response(payload.body, { status: payload.status }))
      : await requestDiscovery(`${normalizedEndpointUrl}${DISCOVERY_ENDPOINT_PATH}`, controller.signal);
    if (!response.ok) {
      onFailure?.({ endpointUrl: normalizedEndpointUrl, kind: 'http', status: response.status });
      return null;
    }
    stage = 'parse';
    const discovery = (await response.json()) as LoadCompanionDiscoveryResponse;
    return {
      compatibility: resolveCompatibility(candidate, discovery),
      discovery,
      endpointUrl: normalizedEndpointUrl
    };
  } catch (error) {
    onFailure?.({ endpointUrl: normalizedEndpointUrl, kind: stage,
      message: error instanceof Error || error instanceof DOMException ? error.message : String(error) });
    return null;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abort);
  }
}

export async function loadCompanionDiscoveryCandidates(
  candidates: DiscoveryCandidate[], onFailure?: DiscoveryFailureReporter
) {
  const discovered: CompanionDiscoveryResult[] = [];
  for (let index = 0; index < candidates.length; index += DISCOVERY_BATCH_SIZE) {
    const batch = candidates.slice(index, index + DISCOVERY_BATCH_SIZE);
    const results = await Promise.all(batch.map((candidate) => tryLoadCompanionDiscovery(candidate, undefined, onFailure)));
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

function getDiscoveryKey(result: CompanionDiscoveryResult) {
  const groupId = result.discovery.group_id?.trim();
  const deviceId = result.discovery.provider_device_id?.trim();
  if (groupId && deviceId) return `group:${groupId}:device:${deviceId}`;
  return result.discovery.runtime_instance_id?.trim() || deviceId || result.endpointUrl;
}

export function appendUniqueDiscovery(results: CompanionDiscoveryResult[], result: CompanionDiscoveryResult) {
  const key = getDiscoveryKey(result);
  const existingIndex = results.findIndex((current) => getDiscoveryKey(current) === key);
  if (existingIndex < 0) return void results.push(result);
  if (results[existingIndex]?.compatibility.status === 'incompatible'
      && result.compatibility.status === 'compatible') results[existingIndex] = result;
}

export async function discoverCompanionDesktops(
  preferredEndpointUrl: string,
  options: CompanionDiscoveryOptions = {}
): Promise<CompanionDiscoveryResult[]> {
  if (options.fastDesktop && options.requiredGroupId && isNativeCompanionNetworkRuntime()) {
    if (!options.allowWhileNotParticipating) {
      const state = await FolioleCompanionSync.loadSyncParticipationState();
      if (!state.sync_enabled || state.sync_paused) return [];
    }
    const groupId = options.requiredGroupId;
    options.onDiscoveryShortened?.();
    return withCompanionRequestSyncLifecycle(signal =>
      discoverReachableDesktop(preferredEndpointUrl, groupId, tryLoadCompanionDiscovery, signal), options.signal);
  }
  const candidates = await loadNativeDiscoveryCandidates(preferredEndpointUrl, options);
  const discovered = await loadCompanionDiscoveryCandidates(candidates);
  if (discovered.length > 0 || !options.requiredGroupId || !isNativeCompanionNetworkRuntime()) {
    return discovered;
  }
  const refreshed = await loadNativeDiscoveryCandidates(preferredEndpointUrl, options);
  return loadCompanionDiscoveryCandidates(refreshed);
}

export async function discoverCompanionDesktop(
  preferredEndpointUrl: string
): Promise<CompanionDiscoveryResult> {
  const results = await loadCompanionDiscoveryCandidates([directCandidate(preferredEndpointUrl)]);
  const [firstResult] = results;
  if (!firstResult) {
    throw new Error('No sync device found. Make sure Sync is on and both devices are on the same Wi-Fi.');
  }
  return firstResult;
}

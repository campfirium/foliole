import type { DesktopSyncGroupJoinCandidatePayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import {
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolTxt,
  syncProtocolVersionHintMatchesDescriptor
} from '../../lib/platform/syncProtocolContract.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { startDesktopDnsSdSession } from './desktopDnsSd.js';
import { qualifyPreparedDesktopAnchorCandidate } from './preparedDesktopAnchorAdapter.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const DISCOVERY_MS = 1_800;
const DISCOVERY_PROBE_MS = 2_000;

type ProbedCandidate = DesktopSyncGroupJoinCandidatePayload & {
  kind: 'anchor' | 'mobile_guide';
};

export async function discoverDesktopSyncGroups(fetchDiscovery: typeof fetch = fetch) {
  const localRuntimeInstanceId = loadSyncGroupRuntimeInstanceId();
  const services = new Map<string, { endpointUrl: string; name: string; txt: Record<string, unknown> }>();
  let failure: Error | null = null;
  const runtime = startDesktopDnsSdSession({
    onError: (error) => { failure = error; },
    onService: ({ kind, service }) => {
      if (kind === 'lost') return;
      const txt = service.txt as Record<string, unknown>;
      if (txt.runtime_instance_id === localRuntimeInstanceId) return;
      if (typeof txt.group_id !== 'string' || typeof txt.group_tag !== 'string') return;
      const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
      if (endpointUrl) services.set(service.fqdn, { endpointUrl, name: service.name, txt });
    }
  });
  await new Promise((resolve) => setTimeout(resolve, DISCOVERY_MS));
  runtime.stop();
  if (failure) throw failure;
  const candidates = (await Promise.all([...services.values()].map((service) =>
    probeCandidate(fetchDiscovery, service, localRuntimeInstanceId)
  ))).filter((candidate): candidate is ProbedCandidate => candidate !== null);
  return selectStableGroupProviders(candidates);
}

async function probeCandidate(
  fetchDiscovery: typeof fetch,
  service: { endpointUrl: string; name: string; txt: Record<string, unknown> },
  localRuntimeInstanceId: string
): Promise<ProbedCandidate | null> {
  try {
    const response = await fetchDiscovery(`${service.endpointUrl}/companion/discovery`, {
      signal: AbortSignal.timeout(DISCOVERY_PROBE_MS)
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    if (payload.runtime_instance_id === localRuntimeInstanceId) return null;
    if (payload.group_id !== service.txt.group_id || payload.group_tag !== service.txt.group_tag) return null;
    const providerPlatform = text(payload.provider_platform) ?? desktopKind(text(payload.desktop_platform) ?? '');
    const mobileGuide = isMobile(providerPlatform);
    if (mobileGuide) {
      const hint = parseSyncProtocolTxt(service.txt);
      if (evaluateSyncProtocolCompatibility(payload.protocol).status !== 'compatible'
          || !syncProtocolVersionHintMatchesDescriptor(hint, payload.protocol)) return null;
    } else if (!qualifyPreparedDesktopAnchorCandidate({
      endpoint_url: service.endpointUrl,
      http: payload,
      txt: service.txt
    }).eligible) return null;
    return {
      endpoint_url: service.endpointUrl,
      group_display_name: text(payload.group_display_name)
        ?? text(service.txt.group_display_name) ?? service.name,
      group_id: String(payload.group_id),
      group_tag: String(payload.group_tag),
      kind: mobileGuide ? 'mobile_guide' : 'anchor',
      provider_device_id: text(payload.provider_device_id) ?? String(service.txt.device_id),
      provider_device_name: text(payload.provider_device_name) ?? service.name,
      provider_platform: providerPlatform
    };
  } catch {
    return null;
  }
}

function selectStableGroupProviders(candidates: ProbedCandidate[]) {
  const groups = new Map<string, ProbedCandidate[]>();
  for (const candidate of candidates) {
    const current = groups.get(candidate.group_tag) ?? [];
    current.push(candidate);
    groups.set(candidate.group_tag, current);
  }
  return [...groups.values()].map((members) => {
    const ordered = [...members].sort((left, right) =>
      left.provider_device_id.localeCompare(right.provider_device_id));
    return ordered.find((candidate) => candidate.kind === 'anchor') ?? ordered[0]!;
  }).map((candidate) => toPublicCandidate(candidate))
    .sort((left, right) => left.group_display_name.localeCompare(right.group_display_name));
}

function toPublicCandidate(candidate: ProbedCandidate): DesktopSyncGroupJoinCandidatePayload {
  return {
    endpoint_url: candidate.endpoint_url,
    group_display_name: candidate.group_display_name,
    group_id: candidate.group_id,
    group_tag: candidate.group_tag,
    provider_device_id: candidate.provider_device_id,
    provider_device_name: candidate.provider_device_name,
    provider_platform: candidate.provider_platform
  };
}

function isMobile(platform: string) {
  return ['android-capacitor', 'ios-capacitor'].includes(platform.toLowerCase());
}

function desktopKind(platform: string) {
  if (platform === 'macOS') return 'darwin';
  if (platform === 'Windows') return 'win32';
  return platform ? platform.toLowerCase() : 'desktop';
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

import { Bonjour } from 'bonjour-service';

import type { DesktopSyncGroupJoinCandidatePayload } from '../../lib/platform/nativeCompanionSyncContract.js';

import { resolveCompanionMdnsIpv4Addresses } from './companionMdnsAdvertisement.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const DISCOVERY_DEADLINE_MS = 60_000;
const DISCOVERY_PROBE_MS = 2_000;
type BonjourOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & { interface: string };
type DiscoveryRuntime = {
  bonjour: InstanceType<typeof Bonjour>;
  browser: ReturnType<InstanceType<typeof Bonjour>['find']>;
};
type DiscoveredService = Parameters<NonNullable<Parameters<InstanceType<typeof Bonjour>['find']>[1]>>[0];

export async function discoverDesktopSyncGroups(
  fetchDiscovery: typeof fetch = fetch
) {
  const localRuntimeInstanceId = loadSyncGroupRuntimeInstanceId();
  const probedEndpoints = new Set<string>();
  const runtimes: DiscoveryRuntime[] = [];
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let settle: (candidates: DesktopSyncGroupJoinCandidatePayload[]) => void = () => undefined;
  const result = new Promise<DesktopSyncGroupJoinCandidatePayload[]>((resolve) => { settle = resolve; });
  const finish = (candidates: DesktopSyncGroupJoinCandidatePayload[]) => {
    if (settled) return;
    settled = true;
    if (deadline) clearTimeout(deadline);
    runtimes.forEach(({ bonjour, browser }) => {
      browser.stop();
      bonjour.destroy();
    });
    settle(selectStableGroupProviders(candidates));
  };
  const collect = (service: DiscoveredService) => {
    const endpoint = endpointForService(service, localRuntimeInstanceId);
    if (!endpoint || probedEndpoints.has(endpoint.endpointUrl)) return;
    probedEndpoints.add(endpoint.endpointUrl);
    void probeCandidate(fetchDiscovery, endpoint.endpointUrl, endpoint.service, localRuntimeInstanceId)
      .then((candidate) => { if (candidate) finish([candidate]); });
  };
  const addresses = resolveCompanionMdnsIpv4Addresses();
  const interfaces = addresses.length > 0 ? addresses : [null];
  interfaces.forEach((networkInterface) => {
    const options = networkInterface ? { interface: networkInterface } as BonjourOptions : undefined;
    const bonjour = new Bonjour(options);
    const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, collect);
    runtimes.push({ bonjour, browser });
  });
  deadline = setTimeout(() => finish([]), DISCOVERY_DEADLINE_MS);
  return result;
}

function endpointForService(service: DiscoveredService, localRuntimeInstanceId: string) {
  const txt = service.txt as Record<string, unknown>;
  if (txt.runtime_instance_id === localRuntimeInstanceId) return null;
  const sourceAddress = service.referer?.address ?? '';
  const host = /^\d+\.\d+\.\d+\.\d+$/.test(sourceAddress) ? sourceAddress :
    service.addresses?.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value));
  if (!host || !service.port || typeof txt.group_id !== 'string' || typeof txt.group_tag !== 'string') return null;
  return { endpointUrl: `http://${host}:${service.port}`, service: { name: service.name, txt } };
}

async function probeCandidate(
  fetchDiscovery: typeof fetch,
  endpointUrl: string,
  service: { name: string; txt: Record<string, unknown> },
  localRuntimeInstanceId: string
) {
  try {
    const response = await fetchDiscovery(`${endpointUrl}/companion/discovery`, {
      signal: AbortSignal.timeout(DISCOVERY_PROBE_MS)
    });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    if (payload.runtime_instance_id === localRuntimeInstanceId) return null;
    if (payload.group_id !== service.txt.group_id || payload.group_tag !== service.txt.group_tag) return null;
    const platform = typeof payload.desktop_platform === 'string' ? payload.desktop_platform : '';
    return {
      endpoint_url: endpointUrl,
      group_display_name: text(payload.group_display_name) ?? text(service.txt.group_display_name) ?? service.name,
      group_id: String(payload.group_id),
      group_tag: String(payload.group_tag),
      provider_authorization_id: text(payload.peer_id) ?? String(service.txt.peer_id),
      provider_host_name: text(payload.provider_host_name) ?? text(payload.desktop_host_name) ?? service.name,
      provider_host_platform: text(payload.provider_host_platform) ?? desktopKind(platform),
      timeline_id: String(payload.timeline_id)
    } satisfies DesktopSyncGroupJoinCandidatePayload;
  } catch {
    return null;
  }
}

function selectStableGroupProviders(candidates: DesktopSyncGroupJoinCandidatePayload[]) {
  const groups = new Map<string, DesktopSyncGroupJoinCandidatePayload>();
  for (const candidate of candidates) {
    const key = candidate.group_tag;
    const current = groups.get(key);
    if (!current || providerRank(candidate) < providerRank(current)) groups.set(key, candidate);
  }
  return [...groups.values()].sort((left, right) => left.group_display_name.localeCompare(right.group_display_name));
}

function providerRank(candidate: DesktopSyncGroupJoinCandidatePayload) {
  return candidate.provider_host_platform === 'android-capacitor' ? 1 : 0;
}

function desktopKind(platform: string) {
  if (platform === 'macOS') return 'darwin';
  if (platform === 'Windows') return 'win32';
  return platform ? platform.toLowerCase() : 'desktop';
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

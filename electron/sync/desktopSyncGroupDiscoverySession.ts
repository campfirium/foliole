import type { DesktopDnsSdService } from '@foliole/desktop-dnssd';

import type { DesktopSyncGroupJoinCandidatePayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import type { SyncGroupDiscoverySnapshot } from '../../lib/platform/syncGroupDiscoveryContract.js';
import { evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { startDesktopDnsSdSession, type DesktopDnsSdSession } from './desktopDnsSd.js';
import { qualifyPreparedDesktopAnchorCandidate } from './preparedDesktopAnchorAdapter.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const PROBE_TIMEOUT_MS = 2_000;
const OBSERVATION_MS = 1_800;

export class DesktopSyncGroupDiscoverySession {
  private readonly services = new Map<string, DesktopDnsSdService>();
  private readonly candidates = new Map<string, DesktopSyncGroupJoinCandidatePayload>();
  private runtime: DesktopDnsSdSession | null = null;
  private stopped = true;
  private observationComplete = false;
  private observationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly emit: (snapshot: SyncGroupDiscoverySnapshot) => void,
    private readonly fetchDiscovery: typeof fetch = fetch
  ) {}

  start() {
    this.stop(false);
    this.stopped = false;
    this.observationComplete = false;
    this.observationTimer = setTimeout(() => {
      this.observationComplete = true;
      if (!this.stopped) this.emitSnapshot('changed');
    }, OBSERVATION_MS);
    this.emitSnapshot('started');
    try {
      this.runtime = startDesktopDnsSdSession({
        onError: (error) => this.fail('discovery_unavailable', error),
        onService: ({ kind, service }) => {
          if (kind === 'lost') this.remove(service);
          else void this.upsert(service, kind);
        }
      });
    } catch (error) {
      this.fail('discovery_unavailable', error);
    }
    return this.snapshot('started');
  }

  stop(emit = true) {
    this.stopped = true;
    this.runtime?.stop();
    this.runtime = null;
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.observationTimer = null;
    this.services.clear();
    this.candidates.clear();
    const snapshot = this.snapshot('stopped');
    if (emit) this.emit(snapshot);
    return snapshot;
  }

  private async upsert(service: DesktopDnsSdService, change: 'found' | 'changed') {
    if (this.stopped || service.txt.runtime_instance_id === loadSyncGroupRuntimeInstanceId()) return;
    this.services.set(service.fqdn, service);
    const result = await probeService(this.fetchDiscovery, service);
    if (this.stopped || this.services.get(service.fqdn) !== service) return;
    if (!result || result.status !== 'results') {
      const status = result?.status ?? 'connection_failed';
      this.emit({ ...this.snapshot('failed'), error_code: status, status });
      return;
    }
    this.candidates.set(service.fqdn, result.candidate);
    this.emitSnapshot(change);
  }

  private remove(service: DesktopDnsSdService) {
    this.services.delete(service.fqdn);
    if (this.candidates.delete(service.fqdn)) this.emitSnapshot('lost');
  }

  private fail(code: string, error: unknown) {
    console.warn('[sync-group-discovery] desktop discovery failed', error);
    this.runtime?.stop();
    this.runtime = null;
    this.services.clear();
    this.candidates.clear();
    const denied = error instanceof Error && /EACCES|EPERM|permission/i.test(error.message);
    this.emit({ ...this.snapshot('failed'), error_code: code,
      status: denied ? 'permission_required' : 'unavailable' });
  }

  private emitSnapshot(change: SyncGroupDiscoverySnapshot['change']) {
    this.emit(this.snapshot(change));
  }

  private snapshot(change: SyncGroupDiscoverySnapshot['change']): SyncGroupDiscoverySnapshot {
    const candidates = selectJoinCandidates([...this.candidates.values()], this.observationComplete);
    return { candidates, change, error_code: null,
      status: change === 'stopped' ? 'stopped' : candidates.length > 0 ? 'results' : 'searching' };
  }
}

async function probeService(fetchDiscovery: typeof fetch, service: DesktopDnsSdService) {
  if (typeof service.txt.group_id !== 'string') return null;
  const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
  return endpointUrl
    ? await probeEndpoint(fetchDiscovery, service, endpointUrl)
      ?? { status: 'connection_failed' as const }
    : null;
}

async function probeEndpoint(fetchDiscovery: typeof fetch, service: DesktopDnsSdService, endpointUrl: string) {
  try {
    const response = await fetchDiscovery(`${endpointUrl}/companion/discovery`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    if (payload.group_id !== service.txt.group_id || payload.group_tag !== service.txt.group_tag) {
      return { status: 'incompatible' as const };
    }
    if (evaluateSyncProtocolCompatibility(payload.protocol).status !== 'compatible') {
      return { status: 'incompatible' as const };
    }
    const providerPlatform = text(payload.provider_platform) ?? desktopKind(text(payload.desktop_platform) ?? '');
    if (!isMobile(providerPlatform)) {
      const qualification = qualifyPreparedDesktopAnchorCandidate({
        endpoint_url: endpointUrl,
        http: payload,
        txt: service.txt as Record<string, unknown>
      });
      if (!qualification.eligible) {
        return { status: qualification.reason === 'not_anchor'
          ? 'waiting_anchor' as const : 'incompatible' as const };
      }
    }
    const candidate = {
      endpoint_url: endpointUrl,
      group_display_name: text(payload.group_display_name) ?? service.name,
      group_id: String(payload.group_id), group_tag: String(payload.group_tag),
      provider_device_id: text(payload.provider_device_id) ?? String(service.txt.device_id),
      provider_device_name: text(payload.provider_device_name) ?? service.name,
      provider_platform: providerPlatform
    } satisfies DesktopSyncGroupJoinCandidatePayload;
    return { candidate, status: 'results' as const };
  } catch { return { status: 'connection_failed' as const }; }
}

function selectJoinCandidates(candidates: DesktopSyncGroupJoinCandidatePayload[], observationComplete: boolean) {
  const groups = new Map<string, DesktopSyncGroupJoinCandidatePayload[]>();
  for (const candidate of candidates) {
    const current = groups.get(candidate.group_tag) ?? [];
    current.push(candidate);
    groups.set(candidate.group_tag, current);
  }
  return [...groups.values()].flatMap((members) => {
    const ordered = [...members].sort((left, right) =>
      left.provider_device_id.localeCompare(right.provider_device_id));
    const anchor = ordered.find((candidate) => !isMobile(candidate.provider_platform));
    return anchor ? [anchor] : observationComplete ? ordered.slice(0, 1) : [];
  }).sort((left, right) => left.group_display_name.localeCompare(right.group_display_name));
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

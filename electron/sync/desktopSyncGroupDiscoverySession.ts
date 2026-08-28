import { Bonjour } from 'bonjour-service';

import type { DesktopSyncGroupJoinCandidatePayload } from '../../lib/platform/nativeCompanionSyncContract.js';
import type { SyncGroupDiscoverySnapshot } from '../../lib/platform/syncGroupDiscoveryContract.js';
import { evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';

import { resolveCompanionMdnsIpv4Addresses } from './companionMdnsAdvertisement.js';
import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { maintainContinuousMdnsQuery } from './continuousMdnsQuery.js';
import { loadSyncGroupRuntimeInstanceId } from './syncGroupRuntimeInstance.js';

const PROBE_TIMEOUT_MS = 2_000;
type Browser = ReturnType<InstanceType<typeof Bonjour>['find']>;
type Service = Parameters<NonNullable<Parameters<InstanceType<typeof Bonjour>['find']>[1]>>[0];
type BonjourOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & { interface: string };

export class DesktopSyncGroupDiscoverySession {
  private readonly services = new Map<string, Service>();
  private readonly candidates = new Map<string, DesktopSyncGroupJoinCandidatePayload>();
  private runtimes: Array<{ bonjour: InstanceType<typeof Bonjour>; browser: Browser;
    query: ReturnType<typeof maintainContinuousMdnsQuery> }> = [];
  private stopped = true;

  constructor(
    private readonly emit: (snapshot: SyncGroupDiscoverySnapshot) => void,
    private readonly fetchDiscovery: typeof fetch = fetch
  ) {}

  start() {
    this.stop(false);
    this.stopped = false;
    this.emitSnapshot('started');
    try {
      this.runtimes = [null, ...resolveCompanionMdnsIpv4Addresses()].map((networkInterface) => {
        const bonjour = networkInterface
          ? new Bonjour({ interface: networkInterface } as BonjourOptions)
          : new Bonjour();
        const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' });
        browser.on('up', (service) => void this.upsert(service, 'found'));
        browser.on('txt-update', (service) => void this.upsert(service, 'changed'));
        browser.on('srv-update', (service) => void this.upsert(service, 'changed'));
        const query = maintainContinuousMdnsQuery(browser);
        browser.on('down', (service) => {
          this.remove(service);
          query.refresh();
        });
        return { bonjour, browser, query };
      });
    } catch (error) {
      this.fail('discovery_unavailable', error);
    }
    return this.snapshot('started');
  }

  stop(emit = true) {
    this.stopped = true;
    this.runtimes.forEach(({ bonjour, browser, query }) => {
      query.stop();
      browser.stop();
      bonjour.destroy();
    });
    this.runtimes = [];
    this.services.clear();
    this.candidates.clear();
    const snapshot = this.snapshot('stopped');
    if (emit) this.emit(snapshot);
    return snapshot;
  }

  private async upsert(service: Service, change: 'found' | 'changed') {
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

  private remove(service: Service) {
    this.services.delete(service.fqdn);
    if (this.candidates.delete(service.fqdn)) this.emitSnapshot('lost');
  }

  private fail(code: string, error: unknown) {
    console.warn('[sync-group-discovery] desktop discovery failed', error);
    const denied = error instanceof Error && /EACCES|EPERM|permission/i.test(error.message);
    this.emit({ ...this.snapshot('failed'), error_code: code,
      status: denied ? 'permission_required' : 'unavailable' });
  }

  private emitSnapshot(change: SyncGroupDiscoverySnapshot['change']) {
    this.emit(this.snapshot(change));
  }

  private snapshot(change: SyncGroupDiscoverySnapshot['change']): SyncGroupDiscoverySnapshot {
    const candidates = [...this.candidates.values()]
      .sort((left, right) => left.group_display_name.localeCompare(right.group_display_name));
    return { candidates, change, error_code: null,
      status: change === 'stopped' ? 'stopped' : candidates.length > 0 ? 'results' : 'searching' };
  }
}

async function probeService(fetchDiscovery: typeof fetch, service: Service) {
  if (typeof service.txt.group_id !== 'string') return null;
  const endpoints = resolveCompanionMdnsServiceEndpoints(service);
  for (const endpointUrl of endpoints) {
    const result = await probeEndpoint(fetchDiscovery, service, endpointUrl);
    if (result?.status !== 'connection_failed') return result;
  }
  return endpoints.length > 0 ? { status: 'connection_failed' as const } : null;
}

async function probeEndpoint(fetchDiscovery: typeof fetch, service: Service, endpointUrl: string) {
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
    const candidate = {
      endpoint_url: endpointUrl,
      group_display_name: text(payload.group_display_name) ?? service.name,
      group_id: String(payload.group_id), group_tag: String(payload.group_tag),
      provider_device_id: text(payload.provider_device_id) ?? String(service.txt.device_id),
      provider_device_name: text(payload.provider_device_name) ?? service.name,
      provider_platform: text(payload.provider_platform) ?? desktopKind(text(payload.desktop_platform) ?? '')
    } satisfies DesktopSyncGroupJoinCandidatePayload;
    return { candidate, status: 'results' as const };
  } catch { return { status: 'connection_failed' as const }; }
}

function desktopKind(platform: string) {
  if (platform === 'macOS') return 'darwin';
  if (platform === 'Windows') return 'win32';
  return platform ? platform.toLowerCase() : 'desktop';
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

import type { DesktopDnsSdService } from '@foliole/desktop-dnssd';

import {
  parseDesktopAnchorRole
} from '../../lib/platform/syncAnchorTopologyContract.js';
import {
  transitionDesktopAnchorTopology,
  type DesktopAnchorTopologyInput,
  type DesktopAnchorTopologyState
} from '../../lib/platform/syncAnchorTopologyStateMachine.js';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import {
  loadDesktopAnchorTopologyState,
  resetDesktopAnchorTopologyState,
  saveDesktopAnchorTopologyState
} from './desktopAnchorTopologyRole.js';
import { startDesktopDnsSdSession, type DesktopDnsSdSession } from './desktopDnsSd.js';
import { isCurrentGroupPeerService, readSyncGroupServiceDeviceId } from './desktopSyncGroupPeerService.js';
import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';
import { qualifyPreparedDesktopAnchorCandidate } from './preparedDesktopAnchorAdapter.js';

export const DESKTOP_ANCHOR_OBSERVATION_MS = 1_800;
const PROBE_TIMEOUT_MS = 2_000;

export interface DesktopAnchorTarget {
  endpointUrl: string;
  groupId: string;
  peerDeviceId: string;
}

type SessionArgs = {
  fetchDiscovery?: typeof fetch;
  group: SyncGroupPayload;
  onAnchor(target: DesktopAnchorTarget, requireSyncBeforeDemote: boolean): Promise<boolean>;
  onAnchorLost(deviceId: string): void;
  onState(state: DesktopAnchorTopologyState): void;
};

export function startDesktopAnchorTopologySession(args: SessionArgs): DesktopDnsSdSession {
  return new DesktopAnchorTopologyController(args).start();
}

class DesktopAnchorTopologyController {
  private active = true;
  private currentAnchor: { service: DesktopDnsSdService; target: DesktopAnchorTarget } | null = null;
  private observationTimer: ReturnType<typeof setTimeout> | null = null;
  private runtime: DesktopDnsSdSession | null = null;
  private readonly fetchDiscovery: typeof fetch;
  private readonly localId: string;

  constructor(private readonly args: SessionArgs) {
    this.fetchDiscovery = args.fetchDiscovery ?? fetch;
    this.localId = args.group.local_device_identity_key;
  }

  start(): DesktopDnsSdSession {
    resetDesktopAnchorTopologyState();
    this.args.onState(loadDesktopAnchorTopologyState());
    this.observe();
    this.runtime = startDesktopDnsSdSession({
      onError: () => this.observe(),
      onService: ({ kind, service }) => this.handleService(kind, service)
    });
    return { stop: () => this.stop() };
  }

  private stop() {
    this.active = false;
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.runtime?.stop();
    resetDesktopAnchorTopologyState();
  }

  private handleService(kind: 'found' | 'changed' | 'lost', service: DesktopDnsSdService) {
    if (!isCurrentGroupPeerService(service, this.args.group)) return;
    if (evaluateDiscoveredSyncProtocol(service.txt as Record<string, unknown>).status === 'incompatible') {
      if (this.observationTimer) clearTimeout(this.observationTimer);
      this.observationTimer = null;
      this.publish(this.transition({ incompatible_group_seen: true, observation_complete: true,
        observed_desktops: [], previous_anchor_reachability: 'unknown' }));
      return;
    }
    const deviceId = readSyncGroupServiceDeviceId(service);
    if (!deviceId || parseDesktopAnchorRole(service.txt.topology_role) !== 'anchor') return;
    const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
    if (!endpointUrl) return;
    const target = { endpointUrl, groupId: this.args.group.group_id, peerDeviceId: deviceId };
    if (kind === 'lost') void this.handleLost(service, target);
    else void this.handleFound(service, target);
  }

  private async handleLost(service: DesktopDnsSdService, target: DesktopAnchorTarget) {
    if (this.currentAnchor?.target.peerDeviceId !== target.peerDeviceId) return;
    if (await probeAnchor(this.fetchDiscovery, service, target.endpointUrl)) return;
    if (!this.active) return;
    this.currentAnchor = null;
    this.args.onAnchorLost(target.peerDeviceId);
    this.publish(this.transition({ incompatible_group_seen: false, observation_complete: false,
      observed_desktops: [], previous_anchor_reachability: 'unreachable' }));
    this.observe();
  }

  private async handleFound(service: DesktopDnsSdService, target: DesktopAnchorTarget) {
    if (!await probeAnchor(this.fetchDiscovery, service, target.endpointUrl) || !this.active) return;
    this.currentAnchor = { service, target };
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.observationTimer = null;
    const observation = [{ device_id: target.peerDeviceId, reachable: true, role: 'anchor' as const }];
    const next = this.transition({ incompatible_group_seen: false, observation_complete: true,
      observed_desktops: observation, previous_anchor_reachability: 'reachable' });
    this.publish(next);
    const requireSync = next.status === 'sync_before_demote';
    const synced = await this.args.onAnchor(target, requireSync);
    if (!this.active || !requireSync || !synced) return;
    this.publish(this.transition({ incompatible_group_seen: false, observation_complete: true,
      observed_desktops: observation, previous_anchor_reachability: 'reachable',
      sync_before_demote_completed: true }));
  }

  private observe() {
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.observationTimer = setTimeout(() => {
      this.observationTimer = null;
      if (!this.active || this.currentAnchor) return;
      this.publish(this.transition({ incompatible_group_seen: false, observation_complete: true,
        observed_desktops: [], previous_anchor_reachability: 'unreachable' }));
    }, DESKTOP_ANCHOR_OBSERVATION_MS);
  }

  private transition(input: DesktopAnchorTopologyInput) {
    return transitionDesktopAnchorTopology(this.localId, loadDesktopAnchorTopologyState(), input);
  }

  private publish(next: DesktopAnchorTopologyState) {
    saveDesktopAnchorTopologyState(next);
    this.args.onState(next);
  }
}

async function probeAnchor(fetchDiscovery: typeof fetch, service: DesktopDnsSdService, endpointUrl: string) {
  try {
    const response = await fetchDiscovery(`${endpointUrl}/companion/discovery`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    if (!response.ok) return false;
    return qualifyPreparedDesktopAnchorCandidate({ endpoint_url: endpointUrl,
      http: await response.json() as Record<string, unknown>,
      txt: service.txt as Record<string, unknown> }).eligible;
  } catch {
    return false;
  }
}

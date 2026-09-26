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
import type { DesktopDnsSdSession } from './desktopDnsSd.js';
import {
  startRecoverableDesktopDnsSdSession, type RecoverableDesktopDnsSdSession
} from './desktopDnsSdRecoverySession.js';
import {
  DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS,
  DESKTOP_SYNC_GROUP_PROBE_TIMEOUT_MS
} from './desktopSyncGroupDiscoveryTiming.js';
import { isCurrentGroupPeerService, readSyncGroupServiceDeviceId } from './desktopSyncGroupPeerService.js';
import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';
import { qualifyPreparedDesktopAnchorCandidate } from './preparedDesktopAnchorAdapter.js';

export interface DesktopAnchorTarget {
  endpointUrl: string;
  groupId: string;
  peerDeviceId: string;
}

export interface DesktopAnchorTopologySession extends DesktopDnsSdSession {
  recoverDiscovery(): void;
  resumePendingSync(): Promise<void>;
}

type SessionArgs = {
  fetchDiscovery?: typeof fetch;
  group: SyncGroupPayload;
  onDiscoveryError?(error: Error): void;
  onDiscoveryStarted?(): void;
  onAnchor(target: DesktopAnchorTarget, requireSyncBeforeDemote: boolean): Promise<boolean>;
  onAnchorLost(deviceId: string): void;
  onState(state: DesktopAnchorTopologyState): void;
};

export function startDesktopAnchorTopologySession(args: SessionArgs): DesktopAnchorTopologySession {
  return new DesktopAnchorTopologyController(args).start();
}

class DesktopAnchorTopologyController {
  private active = true;
  private currentAnchor: { service: DesktopDnsSdService; target: DesktopAnchorTarget } | null = null;
  private discoveryGraceElapsed = false;
  private discoveryRevision = 0;
  private observationTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAnchorProbes = 0;
  private runtime: RecoverableDesktopDnsSdSession | null = null;
  private readonly fetchDiscovery: typeof fetch;
  private readonly localId: string;

  constructor(private readonly args: SessionArgs) {
    this.fetchDiscovery = args.fetchDiscovery ?? fetch;
    this.localId = args.group.local_device_identity_key;
  }

  start(): DesktopAnchorTopologySession {
    resetDesktopAnchorTopologyState();
    this.args.onState(loadDesktopAnchorTopologyState());
    this.runtime = startRecoverableDesktopDnsSdSession({
      onError: (error) => {
        this.suspendObservation();
        this.args.onDiscoveryError?.(error);
      },
      onStarted: () => {
        this.discoveryRevision += 1;
        this.pendingAnchorProbes = 0;
        this.observe();
        const anchor = this.currentAnchor;
        if (anchor) {
          if (loadDesktopAnchorTopologyState().role === 'member') {
            this.publish(this.transition({ incompatible_group_seen: false, observation_complete: false,
              observed_desktops: [], previous_anchor_reachability: 'unknown' }));
          }
          void this.handleLost(anchor.service, anchor.target, this.discoveryRevision);
        }
        this.args.onDiscoveryStarted?.();
      },
      onService: ({ kind, service }) => this.handleService(kind, service)
    });
    return { stop: () => this.stop(), recoverDiscovery: () => this.runtime?.recover(),
      resumePendingSync: () => this.resumePendingSync() };
  }

  private async resumePendingSync() {
    const state = loadDesktopAnchorTopologyState();
    const anchor = this.currentAnchor;
    if (!this.active || state.status !== 'sync_before_demote' || !anchor ||
        anchor.target.peerDeviceId !== state.pending_demote_to) return;
    await this.handleFound(anchor.service, anchor.target);
  }

  private stop() {
    this.active = false;
    this.discoveryRevision += 1;
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.runtime?.stop();
    resetDesktopAnchorTopologyState();
  }

  private handleService(kind: 'found' | 'changed' | 'lost', service: DesktopDnsSdService) {
    if (!isCurrentGroupPeerService(service, this.args.group)) return;
    if (evaluateDiscoveredSyncProtocol(service.txt as Record<string, unknown>).status === 'incompatible') {
      if (this.observationTimer) clearTimeout(this.observationTimer);
      this.observationTimer = null;
      this.discoveryGraceElapsed = false;
      this.publish(this.transition({ incompatible_group_seen: true, observation_complete: true,
        observed_desktops: [], previous_anchor_reachability: 'unknown' }));
      return;
    }
    const deviceId = readSyncGroupServiceDeviceId(service);
    if (!deviceId || parseDesktopAnchorRole(service.txt.topology_role) !== 'anchor') return;
    const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
    if (!endpointUrl) return;
    const target = { endpointUrl, groupId: this.args.group.group_id, peerDeviceId: deviceId };
    const revision = this.discoveryRevision;
    if (kind === 'lost') void this.handleLost(service, target, revision);
    else void this.handleFound(service, target, revision);
  }

  private async handleLost(service: DesktopDnsSdService, target: DesktopAnchorTarget, revision: number) {
    if (this.currentAnchor?.target.peerDeviceId !== target.peerDeviceId) return;
    const reachable = await probeAnchor(this.fetchDiscovery, service, target.endpointUrl);
    if (!this.active || revision !== this.discoveryRevision) return;
    if (reachable) {
      if (loadDesktopAnchorTopologyState().status === 'waiting_anchor') {
        this.publish(this.transition({ incompatible_group_seen: false, observation_complete: true,
          observed_desktops: [{ device_id: target.peerDeviceId, reachable: true, role: 'anchor' }],
          previous_anchor_reachability: 'reachable' }));
      }
      return;
    }
    this.currentAnchor = null;
    this.args.onAnchorLost(target.peerDeviceId);
    this.publish(this.transition({ incompatible_group_seen: false, observation_complete: false,
      observed_desktops: [], previous_anchor_reachability: 'unreachable' }));
    this.observe();
  }

  private async handleFound(service: DesktopDnsSdService, target: DesktopAnchorTarget,
    revision = this.discoveryRevision) {
    this.pendingAnchorProbes += 1;
    try {
      if (!await probeAnchor(this.fetchDiscovery, service, target.endpointUrl) || !this.active
          || revision !== this.discoveryRevision) return;
      this.currentAnchor = { service, target };
      if (this.observationTimer) clearTimeout(this.observationTimer);
      this.observationTimer = null;
      const observation = [{ device_id: target.peerDeviceId, reachable: true, role: 'anchor' as const }];
      const next = this.transition({ incompatible_group_seen: false, observation_complete: true,
        observed_desktops: observation, previous_anchor_reachability: 'reachable' });
      this.publish(next);
      const requireSync = next.status === 'sync_before_demote';
      const synced = await this.args.onAnchor(target, requireSync);
      if (!this.active || revision !== this.discoveryRevision || !requireSync || !synced) return;
      this.publish(this.transition({ incompatible_group_seen: false, observation_complete: true,
        observed_desktops: observation, previous_anchor_reachability: 'reachable',
        sync_before_demote_completed: true }));
    } finally {
      if (revision === this.discoveryRevision) {
        this.pendingAnchorProbes -= 1;
        this.completeObservationIfSettled();
      }
    }
  }

  private suspendObservation() {
    this.discoveryRevision += 1;
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.observationTimer = null;
    this.discoveryGraceElapsed = false;
  }

  private observe() {
    if (this.observationTimer) clearTimeout(this.observationTimer);
    this.discoveryGraceElapsed = false;
    this.observationTimer = setTimeout(() => {
      this.observationTimer = null;
      this.discoveryGraceElapsed = true;
      this.completeObservationIfSettled();
    }, DESKTOP_SYNC_GROUP_DISCOVERY_GRACE_MS);
  }

  private completeObservationIfSettled() {
    if (!this.active || this.currentAnchor || !this.discoveryGraceElapsed || this.pendingAnchorProbes > 0) return;
    this.discoveryGraceElapsed = false;
    this.publish(this.transition({ incompatible_group_seen: false, observation_complete: true,
      observed_desktops: [], previous_anchor_reachability: 'unreachable' }));
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
      signal: AbortSignal.timeout(DESKTOP_SYNC_GROUP_PROBE_TIMEOUT_MS)
    });
    if (!response.ok) return false;
    return qualifyPreparedDesktopAnchorCandidate({ endpoint_url: endpointUrl,
      http: await response.json() as Record<string, unknown>,
      txt: service.txt as Record<string, unknown> }).eligible;
  } catch {
    return false;
  }
}

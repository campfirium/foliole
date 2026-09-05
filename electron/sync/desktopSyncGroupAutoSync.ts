import type { DesktopDnsSdService } from '@foliole/desktop-dnssd';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { startDesktopDnsSdSession, type DesktopDnsSdSession } from './desktopDnsSd.js';
import { desktopDnsSdServiceFacts, logDesktopDnsSdDiagnostic } from './desktopDnsSdDiagnostics.js';
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import {
  isCurrentGroupPeerService,
  readSyncGroupServiceDeviceId
} from './desktopSyncGroupPeerService.js';
import {
  clearDesktopSyncGroupRoutes,
  loadDesktopSyncGroupRoutes,
  removeDesktopSyncGroupRoute,
  saveDesktopSyncGroupRoute
} from './desktopSyncGroupRoutes.js';
import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';

type AvailablePeer = { endpoints: string[]; groupId: string; peerDeviceId: string };

let runtime: DesktopDnsSdSession | null = null;
let manualRuntime: DesktopDnsSdSession | null = null;
let manualRun: Promise<unknown> | null = null;
let rejectManualRun: ((error: Error) => void) | null = null;
let resolveManualPeer: ((peer: AvailablePeer) => void) | null = null;
const inFlight = new Map<string, Promise<unknown>>();
const retryAfterFlight = new Map<string, AvailablePeer>();

function readAvailablePeer(service: DesktopDnsSdService): AvailablePeer | null {
  const endpoints = resolveCompanionMdnsServiceEndpoints(service);
  const txt = service.txt as Record<string, unknown>;
  if (evaluateDiscoveredSyncProtocol(txt).status === 'incompatible') return null;
  const groupId = typeof txt.group_id === 'string' ? txt.group_id : null;
  const peerDeviceId = readSyncGroupServiceDeviceId(service);
  return endpoints.length > 0 && groupId && peerDeviceId ? { endpoints, groupId, peerDeviceId } : null;
}

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtime) return;
  const localGroup = loadDesktopSyncGroup();
  const handleService = (service: DesktopDnsSdService) => {
    if (!isDesktopCompanionSyncParticipating()) return;
    const peer = readAvailablePeer(service);
    if (!peer) return null;
    resolveManualPeer?.(peer);
    return syncAvailablePeer(peer);
  };
  runtime = startDesktopDnsSdSession({
    onError: (error) => {
      console.warn('[sync-group] OS DNS-SD discovery unavailable', error);
      rejectManualRun?.(error);
      runtime?.stop();
      runtime = null;
      clearDesktopSyncGroupRoutes();
    },
    onService: ({ kind, service }) => {
      if (!isCurrentGroupPeerService(service, localGroup)) {
        logDesktopDnsSdDiagnostic('route_rejected', {
          deviceDiffers: readSyncGroupServiceDeviceId(service) !== localGroup?.local_device_identity_key,
          eventKind: kind, reason: 'not_current_group_peer',
          groupMatches: service.txt.group_id === localGroup?.group_id,
          ...desktopDnsSdServiceFacts(service)
        });
        return;
      }
      if (kind === 'lost') {
        const deviceId = readSyncGroupServiceDeviceId(service);
        if (deviceId) removeDesktopSyncGroupRoute(deviceId);
        return;
      }
      logDesktopDnsSdDiagnostic('route_candidate', {
        eventKind: kind, ...desktopDnsSdServiceFacts(service)
      });
      void handleService(service);
    }
  });
}

export function stopDesktopSyncGroupAutoSync() {
  rejectManualRun?.(new Error('desktop_dnssd_session_stopped'));
  runtime?.stop();
  runtime = null;
  manualRuntime?.stop();
  manualRuntime = null;
  retryAfterFlight.clear();
  clearDesktopSyncGroupRoutes();
}

export function runDesktopManualSyncWithDiscovery() {
  if (manualRun) return manualRun;
  const group = loadDesktopSyncGroup();
  if (!group || loadDesktopSyncGroupRoutes(group.group_id).length > 0) {
    return runDesktopSyncCoordinator('manual');
  }
  manualRun = new Promise((resolve, reject) => {
    rejectManualRun = reject;
    resolveManualPeer = (peer) => {
      resolveManualPeer = null;
      void continueManualRun(peer).then(resolve, reject);
    };
    if (runtime) return;
    manualRuntime = startDesktopDnsSdSession({
      onError: reject,
      onService: ({ kind, service }) => {
        if (kind === 'lost' || !isCurrentGroupPeerService(service, group)) return;
        const peer = readAvailablePeer(service);
        if (peer) resolveManualPeer?.(peer);
      }
    });
  }).finally(() => {
    manualRuntime?.stop();
    manualRuntime = null;
    manualRun = null;
    rejectManualRun = null;
    resolveManualPeer = null;
  });
  return manualRun;
}

async function continueManualRun(peer: AvailablePeer) {
  if (!manualRun) return;
  const ownsRoute = Boolean(manualRuntime);
  manualRuntime?.stop();
  manualRuntime = null;
  try {
    return await syncAcrossAvailableEndpoints(loadDesktopSyncGroup(), peer, 'manual');
  } finally {
    if (ownsRoute) removeDesktopSyncGroupRoute(peer.peerDeviceId);
  }
}

async function syncAvailablePeer(args: AvailablePeer) {
  if (!isDesktopCompanionSyncParticipating()) return;
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== args.groupId) return;
  const firstEndpoint = args.endpoints[0];
  if (!firstEndpoint || !resolveDiscoveredPeer(group, args, firstEndpoint)) return;
  if (inFlight.has(args.peerDeviceId)) {
    retryAfterFlight.set(args.peerDeviceId, args);
    return;
  }
  const work = syncAcrossAvailableEndpoints(group, args).catch((error) => {
    console.info('[sync-group] sync paused until provider is available', {
      error: error instanceof Error ? error.message : String(error), peerDeviceId: args.peerDeviceId
    });
  }).finally(() => {
    inFlight.delete(args.peerDeviceId);
    const retry = retryAfterFlight.get(args.peerDeviceId);
    if (!retry) return;
    retryAfterFlight.delete(args.peerDeviceId);
    void syncAvailablePeer(retry);
  });
  inFlight.set(args.peerDeviceId, work);
  await work;
}

async function syncAcrossAvailableEndpoints(
  group: ReturnType<typeof loadDesktopSyncGroup>, args: AvailablePeer,
  reason: 'automatic' | 'manual' = 'automatic'
) {
  if (!group || group.group_id !== args.groupId) return;
  let lastError: unknown;
  for (const endpoint of args.endpoints) {
    const peer = resolveDiscoveredPeer(group, args, endpoint);
    if (!peer) return;
    saveDesktopSyncGroupRoute(peer);
    try {
      return await runDesktopSyncCoordinator(reason, peer);
    } catch (error) {
      removeDesktopSyncGroupRoute(peer.peer_device_id);
      lastError = error;
    }
  }
  throw lastError;
}

function resolveDiscoveredPeer(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  args: AvailablePeer,
  endpoint: string
) {
  const local = group.devices.find((device) =>
    device.device_identity_key === group.local_device_identity_key && device.state === 'active');
  const remote = group.devices.find((device) =>
    device.device_identity_key === args.peerDeviceId && device.state === 'active');
  if (!local || !remote || remote.device_identity_key === local.device_identity_key) return null;
  return {
    endpoint_url: endpoint,
    group_id: group.group_id,
    local_device_id: local.device_identity_key,
    peer_device_id: remote.device_identity_key,
    peer_device_name: remote.device_name,
    peer_platform: remote.platform
  };
}

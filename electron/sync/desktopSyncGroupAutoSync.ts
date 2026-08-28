import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { startDesktopDnsSdBrowse, type DesktopDnsSdService } from './desktopDnsSd.js';
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import {
  clearDesktopSyncGroupRoutes,
  removeDesktopSyncGroupRoute,
  saveDesktopSyncGroupRoute
} from './desktopSyncGroupRoutes.js';
import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';

let runtime: ReturnType<typeof startDesktopDnsSdBrowse> | null = null;
const inFlight = new Map<string, Promise<unknown>>();
type AvailablePeer = { endpoints: string[]; groupId: string; peerDeviceId: string };
const retryAfterFlight = new Map<string, AvailablePeer>();

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtime) return;
  const handleService = (service: DesktopDnsSdService) => {
    if (!isDesktopCompanionSyncParticipating()) return;
    const endpoints = resolveCompanionMdnsServiceEndpoints(service);
    const txt = service.txt as Record<string, unknown>;
    const protocol = evaluateDiscoveredSyncProtocol(txt);
    if (protocol.status === 'incompatible') {
      console.info('[sync-group] sync stopped for incompatible discovered peer', {
        reason: protocol.reason,
        serviceName: service.name
      });
      return null;
    }
    const groupId = typeof txt.group_id === 'string' ? txt.group_id : null;
    const peerDeviceId = typeof txt.device_id === 'string' ? txt.device_id : null;
    if (endpoints.length === 0 || !groupId || !peerDeviceId) return null;
    return syncAvailablePeer({ endpoints, groupId, peerDeviceId });
  };
  try {
    runtime = startDesktopDnsSdBrowse((event) => {
      if (event.kind === 'error') {
        console.info('[sync-group] system DNS-SD unavailable', event);
        stopDesktopSyncGroupAutoSync();
        return;
      }
      if (event.kind === 'lost') {
        const deviceId = typeof event.service.txt.device_id === 'string'
          ? event.service.txt.device_id : null;
        if (deviceId) removeDesktopSyncGroupRoute(deviceId);
        return;
      }
      void handleService(event.service);
    });
  } catch (error) {
    console.info('[sync-group] system DNS-SD unavailable', error);
    stopDesktopSyncGroupAutoSync();
  }
}

export function stopDesktopSyncGroupAutoSync() {
  const activeRuntime = runtime;
  runtime = null;
  activeRuntime?.stop();
  retryAfterFlight.clear();
  clearDesktopSyncGroupRoutes();
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
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>, args: AvailablePeer
) {
  let lastError: unknown;
  for (const endpoint of args.endpoints) {
    const peer = resolveDiscoveredPeer(group, args, endpoint);
    if (!peer) return;
    saveDesktopSyncGroupRoute(peer);
    try {
      await runDesktopSyncCoordinator('automatic', peer);
      return;
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

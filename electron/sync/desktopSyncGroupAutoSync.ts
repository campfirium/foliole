import { Bonjour } from 'bonjour-service';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveCompanionMdnsIpv4Addresses } from './companionMdnsAdvertisement.js';
import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { maintainContinuousMdnsQuery } from './continuousMdnsQuery.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import {
  clearDesktopSyncGroupRoutes,
  removeDesktopSyncGroupRoute,
  saveDesktopSyncGroupRoute
} from './desktopSyncGroupRoutes.js';
import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';

type BonjourOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & { interface: string };
type AutoSyncRuntime = {
  bonjour: InstanceType<typeof Bonjour>;
  browser: ReturnType<InstanceType<typeof Bonjour>['find']>;
  query: ReturnType<typeof maintainContinuousMdnsQuery>;
};
type DiscoveredService = Parameters<NonNullable<Parameters<InstanceType<typeof Bonjour>['find']>[1]>>[0];

let runtimes: AutoSyncRuntime[] = [];
const inFlight = new Map<string, Promise<unknown>>();
type AvailablePeer = { endpoints: string[]; groupId: string; peerDeviceId: string };
const retryAfterFlight = new Map<string, AvailablePeer>();

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtimes.length > 0) return;
  const handleService = (service: DiscoveredService) => {
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
  const consumeService = (service: DiscoveredService) => { void handleService(service); };
  const addresses = resolveCompanionMdnsIpv4Addresses();
  const interfaces = [null, ...addresses];
  runtimes = interfaces.map((networkInterface) => {
    const options = networkInterface ? { interface: networkInterface } as BonjourOptions : undefined;
    const bonjour = new Bonjour(options);
    const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, consumeService);
    const query = maintainContinuousMdnsQuery(browser);
    const runtime = { bonjour, browser, query };
    browser.on('down', (service) => {
      const deviceId = typeof service.txt.device_id === 'string' ? service.txt.device_id : null;
      if (deviceId) removeDesktopSyncGroupRoute(deviceId);
      const work = handleService(service);
      void Promise.resolve(work).finally(() => {
        if (runtimes.includes(runtime)) query.refresh();
      });
    });
    browser.on('txt-update', consumeService);
    browser.on('srv-update', consumeService);
    return runtime;
  });
}

export function stopDesktopSyncGroupAutoSync() {
  const activeRuntimes = runtimes;
  runtimes = [];
  activeRuntimes.forEach(({ bonjour, browser, query }) => {
    query.stop();
    browser.stop();
    bonjour.destroy();
  });
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

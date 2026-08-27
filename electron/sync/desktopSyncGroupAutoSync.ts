import { Bonjour } from 'bonjour-service';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveCompanionMdnsIpv4Addresses } from './companionMdnsAdvertisement.js';
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
};
type DiscoveredService = Parameters<NonNullable<Parameters<InstanceType<typeof Bonjour>['find']>[1]>>[0];

let runtimes: AutoSyncRuntime[] = [];
const inFlight = new Map<string, Promise<unknown>>();
const retryAfterFlight = new Map<string, { endpoint: string; groupId: string; peerDeviceId: string }>();

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtimes.length > 0) return;
  const handleService = (service: DiscoveredService) => {
    if (!isDesktopCompanionSyncParticipating()) return;
    const endpoint = endpointForService(service);
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
    if (!endpoint || !groupId || !peerDeviceId) return null;
    return syncAvailablePeer({ endpoint, groupId, peerDeviceId });
  };
  const consumeService = (service: DiscoveredService) => { void handleService(service); };
  const addresses = resolveCompanionMdnsIpv4Addresses();
  const interfaces = [null, ...addresses];
  runtimes = interfaces.map((networkInterface) => {
    const options = networkInterface ? { interface: networkInterface } as BonjourOptions : undefined;
    const bonjour = new Bonjour(options);
    const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, consumeService);
    const runtime = { bonjour, browser };
    browser.on('down', (service) => {
      const deviceId = typeof service.txt.device_id === 'string' ? service.txt.device_id : null;
      if (deviceId) removeDesktopSyncGroupRoute(deviceId);
      const work = handleService(service);
      void Promise.resolve(work).finally(() => {
        if (runtimes.includes(runtime)) browser.update();
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
  activeRuntimes.forEach(({ bonjour, browser }) => {
    browser.stop();
    bonjour.destroy();
  });
  retryAfterFlight.clear();
  clearDesktopSyncGroupRoutes();
}

async function syncAvailablePeer(args: { endpoint: string; groupId: string; peerDeviceId: string }) {
  if (!isDesktopCompanionSyncParticipating()) return;
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== args.groupId) return;
  const peer = resolveDiscoveredPeer(group, args);
  if (!peer) return;
  if (inFlight.has(args.peerDeviceId)) {
    retryAfterFlight.set(args.peerDeviceId, args);
    return;
  }
  const work = runDesktopSyncCoordinator('automatic', peer).catch((error) => {
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

function resolveDiscoveredPeer(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  args: { endpoint: string; groupId: string; peerDeviceId: string }
) {
  const local = group.devices.find((device) =>
    device.device_identity_key === group.local_device_identity_key && device.state === 'active');
  const remote = group.devices.find((device) =>
    device.device_identity_key === args.peerDeviceId && device.state === 'active');
  if (!local || !remote || remote.device_identity_key === local.device_identity_key) return null;
  return saveDesktopSyncGroupRoute({
    endpoint_url: args.endpoint,
    group_id: group.group_id,
    local_device_id: local.device_identity_key,
    peer_device_id: remote.device_identity_key,
    peer_device_name: remote.device_name,
    peer_platform: remote.platform
  });
}

function endpointForService(service: { addresses?: string[]; port?: number; referer?: { address?: string } }) {
  const sourceAddress = service.referer?.address ?? '';
  const host = /^\d+\.\d+\.\d+\.\d+$/.test(sourceAddress) ? sourceAddress
    : service.addresses?.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value));
  return host && service.port ? `http://${host}:${service.port}` : null;
}

import { Bonjour } from 'bonjour-service';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import {
  resolveCompanionMdnsDiscoveryInterfaces,
  resolveCompanionMdnsInterfaceOptions
} from './companionMdnsNetworkInterfaces.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import {
  completeDesktopSyncGroupJoin,
  continueDesktopSyncGroupSync
} from './desktopSyncGroupJoin.js';
import { refreshDesktopSyncGroupPendingJoinEndpoint } from './desktopSyncGroupJoinState.js';
import { evaluateDiscoveredSyncProtocol } from './desktopSyncProtocolGate.js';

type BonjourOptions = NonNullable<ConstructorParameters<typeof Bonjour>[0]> & {
  bind: string;
  interface: string;
};
type AutoSyncRuntime = {
  bonjour: InstanceType<typeof Bonjour>;
  browser: ReturnType<InstanceType<typeof Bonjour>['find']>;
};
type DiscoveredService = Parameters<NonNullable<Parameters<InstanceType<typeof Bonjour>['find']>[1]>>[0];

let runtimes: AutoSyncRuntime[] = [];
const inFlight = new Map<string, Promise<unknown>>();
const retryAfterFlight = new Map<string, { endpoint: string; groupId: string; peerAuthorizationId: string }>();

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
    const peerAuthorizationId = typeof txt.peer_id === 'string' ? txt.peer_id : null;
    const timelineId = typeof txt.timeline_id === 'string' ? txt.timeline_id : null;
    if (!endpoint || !groupId || !peerAuthorizationId) return null;
    if (timelineId && refreshDesktopSyncGroupPendingJoinEndpoint({
      endpointUrl: endpoint, groupId, providerAuthorizationId: peerAuthorizationId, timelineId
    })) {
      return completeDesktopSyncGroupJoin().catch((error) => {
        console.info('[sync-group] approved join waiting for provider', {
          error: error instanceof Error ? error.message : String(error), peerAuthorizationId
        });
      });
    }
    return syncAvailablePeer({ endpoint, groupId, peerAuthorizationId });
  };
  const consumeService = (service: DiscoveredService) => { void handleService(service); };
  const interfaces = resolveCompanionMdnsDiscoveryInterfaces();
  runtimes = interfaces.map((networkInterface) => {
    const options = resolveCompanionMdnsInterfaceOptions(networkInterface) as BonjourOptions | undefined;
    const bonjour = new Bonjour(options);
    const browser = bonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, consumeService);
    const runtime = { bonjour, browser };
    browser.on('down', (service) => {
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
}

async function syncAvailablePeer(args: { endpoint: string; groupId: string; peerAuthorizationId: string }) {
  if (!isDesktopCompanionSyncParticipating()) return;
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== args.groupId) return;
  const peer = resolveDiscoveredPeer(group, args);
  if (!peer) return;
  if (inFlight.has(args.peerAuthorizationId)) {
    retryAfterFlight.set(args.peerAuthorizationId, args);
    return;
  }
  const work = continueDesktopSyncGroupSync(peer).catch((error) => {
    console.info('[sync-group] sync paused until provider is available', {
      error: error instanceof Error ? error.message : String(error), peerAuthorizationId: args.peerAuthorizationId
    });
  }).finally(() => {
    inFlight.delete(args.peerAuthorizationId);
    const retry = retryAfterFlight.get(args.peerAuthorizationId);
    if (!retry) return;
    retryAfterFlight.delete(args.peerAuthorizationId);
    void syncAvailablePeer(retry);
  });
  inFlight.set(args.peerAuthorizationId, work);
  await work;
}

function resolveDiscoveredPeer(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  args: { endpoint: string; groupId: string; peerAuthorizationId: string }
) {
  const local = group.members.find((member) => member.host_name === group.local_host_name);
  const remote = group.members.find((member) => member.authorization_id === args.peerAuthorizationId);
  if (!local || !remote || remote.host_name === group.local_host_name) return null;
  return {
    endpoint_url: args.endpoint,
    group_id: group.group_id,
    local_authorization_id: local.authorization_id,
    local_host_name: local.host_name,
    peer_authorization_id: remote.authorization_id,
    peer_host_name: remote.host_name,
    peer_host_platform: remote.host_platform,
    timeline_id: group.timeline_id
  };
}

function endpointForService(service: { addresses?: string[]; port?: number; referer?: { address?: string } }) {
  const host = service.addresses?.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value))
    ?? (/^\d+\.\d+\.\d+\.\d+$/.test(service.referer?.address ?? '') ? service.referer?.address : null);
  return host && service.port ? `http://${host}:${service.port}` : null;
}

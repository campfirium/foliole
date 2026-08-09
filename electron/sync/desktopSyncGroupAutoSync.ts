import { Bonjour } from 'bonjour-service';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { loadPairedSyncGroupPeers, savePairedSyncGroupPeer } from './companionPairingStore.js';
import {
  completeDesktopSyncGroupJoin,
  continueDesktopSyncGroupSync
} from './desktopSyncGroupJoin.js';
import { refreshDesktopSyncGroupPendingJoinEndpoint } from './desktopSyncGroupJoinState.js';

let bonjour: InstanceType<typeof Bonjour> | null = null;
let browser: ReturnType<InstanceType<typeof Bonjour>['find']> | null = null;
const inFlight = new Map<string, Promise<unknown>>();
const retryAfterFlight = new Map<string, { endpoint: string; groupId: string; peerDeviceId: string }>();

export function startDesktopSyncGroupAutoSync() {
  if (bonjour) return;
  const nextBonjour = new Bonjour();
  bonjour = nextBonjour;
  browser = nextBonjour.find({ protocol: 'tcp', type: 'foliole-sync' }, (service) => {
    const endpoint = endpointForService(service);
    const txt = service.txt as Record<string, unknown>;
    const groupId = typeof txt.group_id === 'string' ? txt.group_id : null;
    const peerDeviceId = typeof txt.peer_id === 'string' ? txt.peer_id : null;
    const timelineId = typeof txt.timeline_id === 'string' ? txt.timeline_id : null;
    if (!endpoint || !groupId || !peerDeviceId) return;
    if (timelineId && refreshDesktopSyncGroupPendingJoinEndpoint({
      endpointUrl: endpoint, groupId, providerDeviceId: peerDeviceId, timelineId
    })) {
      void completeDesktopSyncGroupJoin().catch((error) => {
        console.info('[sync-group] approved join waiting for provider', {
          error: error instanceof Error ? error.message : String(error), peerDeviceId
        });
      });
      return;
    }
    void syncAvailablePeer({ endpoint, groupId, peerDeviceId });
  });
}

export function stopDesktopSyncGroupAutoSync() {
  browser?.stop();
  bonjour?.destroy();
  browser = null;
  bonjour = null;
  retryAfterFlight.clear();
}

async function syncAvailablePeer(args: { endpoint: string; groupId: string; peerDeviceId: string }) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== args.groupId) return;
  const stored = loadPairedSyncGroupPeers(args.groupId)
    .find((peer) => peer.peer_device_id === args.peerDeviceId);
  if (!stored) return;
  if (inFlight.has(args.peerDeviceId)) {
    retryAfterFlight.set(args.peerDeviceId, args);
    return;
  }
  const peer = savePairedSyncGroupPeer({ ...stored, endpoint_url: args.endpoint });
  const work = continueDesktopSyncGroupSync(peer).catch((error) => {
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

function endpointForService(service: { addresses?: string[]; port?: number; referer?: { address?: string } }) {
  const host = service.addresses?.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value))
    ?? (/^\d+\.\d+\.\d+\.\d+$/.test(service.referer?.address ?? '') ? service.referer?.address : null);
  return host && service.port ? `http://${host}:${service.port}` : null;
}

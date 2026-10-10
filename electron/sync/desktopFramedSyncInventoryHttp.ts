import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventory.js';
import { differingNodeIds, framedSyncInventorySummary } from '../../lib/core/sync/framedSyncInventorySummary.js';
import {
  decodeFramedSyncInventory,
  iterateFramedSyncInventory
} from '../../lib/core/sync/framedSyncInventoryWire.js';
import type {
  FramedSyncSessionContext,
  FramedSyncSessionNoncePort
} from '../../lib/core/sync/framedSyncSession.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';
import { readFramedSyncPayloadBudget } from '../database/framedSyncPayloadBudgetOwner.js';

import { respondDesktopFramedSyncDifferenceRequests } from './desktopFramedSyncDifferenceReplies.js';
import { postDesktopFramedSync } from './desktopFramedSyncHttp.js';
import { hasDesktopFramedSyncPendingPublications, resumeDesktopFramedSyncPendingPublications } from './desktopFramedSyncPendingPublications.js';
import { runDesktopFramedSyncResourceRound } from './desktopFramedSyncResourceRound.js';
import { readDesktopFramedSyncRoundInventory } from './desktopFramedSyncRoundInventory.js';
import {
  encodeDesktopFramedSyncSession,
  readDesktopFramedSyncSession
} from './desktopFramedSyncSessionWire.js';
import type { FramedSyncStreamBody, FramedSyncWireFrame } from './desktopFramedSyncStream.js';
import { desktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

export { requestDesktopFramedSyncDifferenceHttp, requestDesktopFramedSyncResourcesHttp }
  from './desktopFramedSyncDifferenceHttp.js';

type AuthenticatedContext = Omit<FramedSyncSessionContext, 'sessionId'>;

export async function respondDesktopFramedSyncInventory(args: {
  context: AuthenticatedContext;
  db: DbPort;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
  staging: FramedSyncStagingPort;
  stream: FramedSyncStreamBody<FramedSyncWireFrame>;
}) {
  let plaintextBytes = 0;
  const incoming = readDesktopFramedSyncSession({
    authenticatedContext: args.context,
    authorDeviceId: args.context.initiatorDeviceId,
    frames: args.stream.frames, groupKey: args.groupKey, preamble: args.stream.preamble,
    onPlaintextBytes: bytes => { plaintextBytes += bytes; }
  });
  const first = await incoming.next();
  if (first.done) throw new Error('inventory_exchange_incomplete');
  if (first.value.payloadCase === 'difference_request') {
    const requests = [first.value];
    try {
      for await (const request of incoming) {
        requests.push(request);
        if (requests.length > FRAMED_SYNC_BATCH_LIMITS.maxItems || plaintextBytes > FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
          throw new Error('framed_sync_difference_request_limit_exceeded');
        }
      }
      if (plaintextBytes > FRAMED_SYNC_LIMITS.maxControlMessageBytes) throw new Error('framed_sync_difference_request_limit_exceeded');
      return respondDesktopFramedSyncDifferenceRequests({ ...args, requests });
    } finally { await incoming.return(undefined); }
  }
  const { roundId, detailGlobalIds = [], summaryOnly = false } = await consumeRemoteInventory(args, (async function* () {
    try { yield first.value; yield* incoming; }
    finally { await incoming.return(undefined); }
  })());
  const entries = await readDesktopFramedSyncRoundInventory(args.db);
  const messages = iterateFramedSyncInventory({ entries: detailGlobalIds.length ?
    entries.filter(entry => entry.objectType === 'node' && detailGlobalIds.includes(entry.globalId)) :
    summaryOnly ? framedSyncInventorySummary(entries) : entries, roundId });
  return encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages,
    noncePort: args.noncePort,
    payloadBudget: readFramedSyncPayloadBudget(args.db)
  });
}

async function consumeRemoteInventory(args: Parameters<typeof respondDesktopFramedSyncInventory>[0],
  messages: Parameters<typeof decodeFramedSyncInventory>[0]) {
  const route = loadDesktopSyncGroupRoutes(args.context.groupId).find((peer) =>
    peer.peer_device_id === args.context.initiatorDeviceId);
  const endpoint = route ? {
    db: args.db, groupId: args.context.groupId, groupSecret: args.groupSecret,
    local: { deviceId: args.context.responderDeviceId, libraryEpoch: args.context.responderLibraryEpoch },
    peer: { deviceId: args.context.initiatorDeviceId, libraryEpoch: args.context.initiatorLibraryEpoch },
    peerOrigin: route.endpoint_url, staging: args.staging
  } : undefined;
  const resume = endpoint && await hasDesktopFramedSyncPendingPublications(endpoint);
  const nodeIds: string[] = [];
  const { roundId, entries: remoteInventory, detailGlobalIds = [], summaryOnly = false } = await decodeFramedSyncInventory(messages, {
    retainEntries: Boolean(resume),
    observeEntries(entries) {
      if (route) for (const entry of entries) if (entry.objectType === 'node') nodeIds.push(entry.globalId);
    }
  });
  if (resume && endpoint && route && desktopSyncGroupMemberStateReadiness(route.peer_device_id) !== 'restore') {
    await resumeDesktopFramedSyncPendingPublications({ ...endpoint, remoteInventory });
  }
  if (!detailGlobalIds.length && route && desktopSyncGroupMemberStateReadiness(route.peer_device_id) !== 'restore') {
    await reconcileResponderResources(args, route.endpoint_url, roundId, nodeIds);
  }
  return { roundId, detailGlobalIds, summaryOnly };
}

async function reconcileResponderResources(args: Parameters<typeof respondDesktopFramedSyncInventory>[0],
  endpointUrl: string, roundId: Uint8Array, nodeIds: readonly string[]) {
  await runDesktopFramedSyncResourceRound({ ...args, endpointUrl, roundId,
    context: { ...args.context,
      initiatorDeviceId: args.context.responderDeviceId,
      initiatorLibraryEpoch: args.context.responderLibraryEpoch,
      responderDeviceId: args.context.initiatorDeviceId,
      responderLibraryEpoch: args.context.initiatorLibraryEpoch }
  }, nodeIds);
}

export async function exchangeDesktopFramedSyncInventoryHttp(args: {
  localInventory?: readonly FramedSyncInventoryEntry[];
  context: AuthenticatedContext;
  db: DbPort;
  endpointUrl: string;
  groupKey: Uint8Array;
  groupSecret: string;
  noncePort: FramedSyncSessionNoncePort;
  detailGlobalIds?: readonly string[];
}): Promise<{ local: readonly FramedSyncInventoryEntry[]; remote: readonly FramedSyncInventoryEntry[]; roundId: Uint8Array }> {
  const roundId = crypto.getRandomValues(new Uint8Array(16));
  const local = args.localInventory ?? await readDesktopFramedSyncRoundInventory(args.db);
  const messages = iterateFramedSyncInventory({ entries: framedSyncInventorySummary(local), roundId,
    detailGlobalIds: args.detailGlobalIds ?? [], summaryOnly: true });
  const body = await encodeDesktopFramedSyncSession({
    authenticatedContext: args.context,
    groupKey: args.groupKey,
    messages,
    noncePort: args.noncePort,
    payloadBudget: readFramedSyncPayloadBudget(args.db)
  });
  const response = await postDesktopFramedSync({
    body,
    payloadBudget: readFramedSyncPayloadBudget(args.db),
    endpointUrl: args.endpointUrl,
    groupId: args.context.groupId,
    localDeviceId: args.context.initiatorDeviceId,
    localLibraryEpoch: args.context.initiatorLibraryEpoch,
    pathWithQuery: '/companion/framed-sync',
    remoteDeviceId: args.context.responderDeviceId,
    remoteLibraryEpoch: args.context.responderLibraryEpoch,
    secret: args.groupSecret
  });
  const decoded = readDesktopFramedSyncSession({
    authenticatedContext: args.context,
    authorDeviceId: args.context.responderDeviceId,
    frames: response.stream.frames,
    groupKey: args.groupKey,
    preamble: response.stream.preamble
  });
  const remote = await decodeFramedSyncInventory(decoded);
  if (!sameBytes(remote.roundId, roundId)) throw new Error('inventory_round_identity_mismatch');
  if (!args.detailGlobalIds) {
    const detailGlobalIds = differingNodeIds(local, remote.entries);
    if (detailGlobalIds.length) {
      const details = await exchangeDesktopFramedSyncInventoryHttp({ ...args, localInventory: local, detailGlobalIds });
      const byId = new Map(details.remote.map(entry => [entry.globalId, entry]));
      return { local, remote: remote.entries.map(entry => entry.objectType === 'node' ? byId.get(entry.globalId) ?? entry : entry),
        roundId: details.roundId };
    }
  }
  return { local, remote: remote.entries, roundId };
}


function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

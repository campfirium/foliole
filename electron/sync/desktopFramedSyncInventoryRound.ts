import {
  FRAMED_SYNC_PROTOCOL_VERSION
} from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { createFramedSyncInventoryDependencyLookup } from '../../lib/core/sync/framedSyncInventoryDependencyLookup.js';
import { deliverFramedSyncDifferencesInDependencyOrder } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';

import type { InboundRound } from './desktopFramedSyncInboundRound.js';
import {
  exchangeDesktopFramedSyncInventoryHttp
} from './desktopFramedSyncInventoryHttp.js';
import { resumeDesktopFramedSyncPendingPublications } from './desktopFramedSyncPendingPublications.js';
import { runDesktopFramedSyncResourceRound } from './desktopFramedSyncResourceRound.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import { loadRoundRuntime } from './desktopFramedSyncRoundRuntime.js';
import { runVerifiedDesktopFramedSyncRestoreRound } from './desktopFramedSyncVerifiedRestoreRound.js';
import { createDesktopFramedSyncWindowDelivery } from './desktopFramedSyncWindowDelivery.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

type InventoryRoundState = { inventories: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>> };

export async function runDesktopFramedSyncInventoryRound(args: {
  localLibraryEpoch: string;
  peer: DesktopSyncGroupPeer;
  remoteLibraryEpoch: string;
  restoreId?: string;
}) {
  const runtime = await loadRoundRuntime(args.peer);
  const { adoption } = runtime;
  const local = { deviceId: args.peer.local_device_id, libraryEpoch: adoption?.libraryEpoch ?? args.restoreId ?? args.localLibraryEpoch };
  const remote = { deviceId: args.peer.peer_device_id, libraryEpoch: args.remoteLibraryEpoch };
  if (!args.restoreId && !adoption) await resumeDesktopFramedSyncPendingPublications({
    db: runtime.db, groupId: args.peer.group_id, groupSecret: runtime.groupSecret,
    local, peer: remote, peerOrigin: args.peer.endpoint_url, staging: runtime.staging
  });
  const context = roundContext(args.peer.group_id, local, remote);
  const exchange = {
    context,
    db: runtime.db,
    endpointUrl: args.peer.endpoint_url,
    groupKey: runtime.groupKey,
    groupSecret: runtime.groupSecret,
    noncePort: runtime.noncePort
  };
  const round: InventoryRoundState = { inventories: await exchangeDesktopFramedSyncInventoryHttp(exchange) };
  const inbound = {
    ...exchange,
    roundId: round.inventories.roundId,
    staging: runtime.staging
  };
  let restored = 0;
  if (args.restoreId || adoption) {
    const restore = await runVerifiedDesktopFramedSyncRestoreRound({
      ...(adoption ? { adoption } : {}),
      ...(args.restoreId && !adoption ? { restoreId: args.restoreId } : {}),
      inventories: round.inventories,
      inbound,
      exchange
    });
    if (!restore.complete) return restore;
    restored = restore.transferred;
    round.inventories = await exchangeDesktopFramedSyncInventoryHttp(exchange);
  }
  const endpoint = createDesktopFramedSyncRoundEndpoint({
    db: runtime.db, groupId: args.peer.group_id, groupSecret: runtime.groupSecret,
    local, peer: remote, peerOrigin: args.peer.endpoint_url, staging: runtime.staging
  });
  const { database, inventories: confirmed } = await reconcileDatabaseRounds(exchange, round, endpoint, inbound);
  const resources = await runDesktopFramedSyncResourceRound(
    { ...inbound, roundId: confirmed.roundId }, resourceScope(confirmed));
  return { ...database, transferred: restored + database.transferred, databaseComplete: database.complete, resources,
    complete: database.complete && resources.pending === 0 };
}

async function reconcileDatabaseRounds(
  exchange: Parameters<typeof exchangeDesktopFramedSyncInventoryHttp>[0],
  round: InventoryRoundState,
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>,
  inbound: InboundRound
) {
  let transferred = 0;
  for (;;) {
    const inventories = round.inventories;
    const result = await transferDifferences(inventories, endpoint,
      { ...inbound, roundId: inventories.roundId });
    if (!result) return { database: { complete: true, pending: 0, transferred }, inventories };
    transferred += result.transferred;
    const next = await exchangeDesktopFramedSyncInventoryHttp(exchange);
    const changed = JSON.stringify(inventories.local) !== JSON.stringify(next.local)
      || JSON.stringify(inventories.remote) !== JSON.stringify(next.remote);
    round.inventories = next;
    if (!changed) {
      const remaining = compareFramedSyncDatabaseInventories(next);
      return { database: { complete: remaining.length === 0 && result.complete,
        pending: Math.max(remaining.length, result.pending), transferred }, inventories: next };
    }
  }
}

function* resourceScope(inventories: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>) {
  let left = 0;
  let right = 0;
  while (left < inventories.local.length || right < inventories.remote.length) {
    const a = inventories.local[left];
    const b = inventories.remote[right];
    const order = !a ? 1 : !b ? -1 : compareSyncIdentityText(a.objectType, b.objectType) || compareSyncIdentityText(a.globalId, b.globalId);
    const next = order <= 0 ? a! : b!;
    if (order <= 0) left += 1;
    if (order >= 0) right += 1;
    if (next.objectType === 'node') yield next.globalId;
  }
}

async function transferDifferences(
  inventories: InventoryRoundState['inventories'],
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>,
  inbound: InboundRound
) {
  const window = createDesktopFramedSyncWindowDelivery(inventories, endpoint, inbound);
  if (!window) return null;
  let transferred = 0;
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(window.differences, async (difference) => {
    const result = await window.deliver(difference);
    if (result.sent) transferred += 1;
    return result.state;
  }, createFramedSyncInventoryDependencyLookup(inventories));
  return { complete: deferred.length === 0, pending: deferred.length, transferred };
}

function roundContext(groupId: string, local: { deviceId: string; libraryEpoch: string },
  remote: { deviceId: string; libraryEpoch: string }): InboundRound['context'] {
  return { groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: local.deviceId, initiatorLibraryEpoch: local.libraryEpoch,
    responderDeviceId: remote.deviceId, responderLibraryEpoch: remote.libraryEpoch };
}

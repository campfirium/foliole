import {
  FRAMED_SYNC_PROTOCOL_VERSION
} from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import { deliverFramedSyncDifferencesInDependencyOrder, framedSyncOrderBodyDependencies } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { compareSyncIdentityText } from '../../lib/core/sync/syncIdentityKeyOrder.js';

import { createDesktopFramedSyncDifferenceBatchDelivery } from './desktopFramedSyncDifferenceBatchDelivery.js';
import { createDesktopFramedSyncInboundBatchDelivery } from './desktopFramedSyncInboundBatchRound.js';
import type { InboundRound } from './desktopFramedSyncInboundRound.js';
import {
  exchangeDesktopFramedSyncInventoryHttp
} from './desktopFramedSyncInventoryHttp.js';
import { resumeDesktopFramedSyncPendingPublications } from './desktopFramedSyncPendingPublications.js';
import { runDesktopFramedSyncResourceRound } from './desktopFramedSyncResourceRound.js';
import { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';
import { loadRoundRuntime } from './desktopFramedSyncRoundRuntime.js';
import { runVerifiedDesktopFramedSyncRestoreRound } from './desktopFramedSyncVerifiedRestoreRound.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

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
  let inventories = await exchangeDesktopFramedSyncInventoryHttp(exchange);
  const inbound = {
    ...exchange,
    roundId: inventories.roundId,
    staging: runtime.staging
  };
  let restored = 0;
  if (args.restoreId || adoption) {
    const restore = await runVerifiedDesktopFramedSyncRestoreRound({
      ...(adoption ? { adoption } : {}),
      ...(args.restoreId && !adoption ? { restoreId: args.restoreId } : {}),
      inventories,
      inbound,
      exchange
    });
    if (!restore.complete) return restore;
    restored = restore.transferred;
    inventories = await exchangeDesktopFramedSyncInventoryHttp(exchange);
  }
  const endpoint = createDesktopFramedSyncRoundEndpoint({
    db: runtime.db, groupId: args.peer.group_id, groupSecret: runtime.groupSecret,
    local, peer: remote, peerOrigin: args.peer.endpoint_url, staging: runtime.staging
  });
  const { database, inventories: confirmed } = await reconcileDatabaseRounds(exchange, inventories, endpoint, inbound);
  const resources = await runDesktopFramedSyncResourceRound(
    { ...inbound, roundId: confirmed.roundId }, resourceScope(confirmed));
  return { ...database, transferred: restored + database.transferred, databaseComplete: database.complete, resources,
    complete: database.complete && resources.pending === 0 };
}

async function reconcileDatabaseRounds(
  exchange: Parameters<typeof exchangeDesktopFramedSyncInventoryHttp>[0],
  initial: Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>,
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>,
  inbound: InboundRound
) {
  let inventories = initial;
  let transferred = 0;
  for (;;) {
    const differences = compareFramedSyncDatabaseInventories(inventories);
    if (!differences.length) return { database: { complete: true, pending: 0, transferred }, inventories };
    const result = await transferDifferences(differences, endpoint,
      { ...inbound, roundId: inventories.roundId }, framedSyncOrderBodyDependencies(inventories));
    transferred += result.transferred;
    const next = await exchangeDesktopFramedSyncInventoryHttp(exchange);
    const changed = compareFramedSyncDatabaseInventories({ local: inventories.local, remote: next.local }).length > 0
      || compareFramedSyncDatabaseInventories({ local: inventories.remote, remote: next.remote }).length > 0;
    inventories = next;
    if (!changed) {
      const remaining = compareFramedSyncDatabaseInventories(inventories);
      return { database: { complete: remaining.length === 0 && result.complete,
        pending: Math.max(remaining.length, result.pending), transferred }, inventories };
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
  differences: ReturnType<typeof compareFramedSyncDatabaseInventories>,
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>,
  inbound: InboundRound,
  dependencies: ReturnType<typeof framedSyncOrderBodyDependencies>
) {
  let transferred = 0;
  const deliverLocal = createDesktopFramedSyncDifferenceBatchDelivery(differences, endpoint);
  const deliverRemote = createDesktopFramedSyncInboundBatchDelivery(differences, inbound);
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences, async (difference) => {
    if (difference.direction === 'remote_to_local') {
      const result = await deliverRemote(difference);
      if (result.sent) transferred += 1;
      return result.state;
    }
    const result = await deliverLocal(difference);
    if (result.sent) transferred += 1;
    return result.state;
  }, dependencies);
  return { complete: deferred.length === 0, pending: deferred.length, transferred };
}

function roundContext(groupId: string, local: { deviceId: string; libraryEpoch: string },
  remote: { deviceId: string; libraryEpoch: string }): InboundRound['context'] {
  return { groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: local.deviceId, initiatorLibraryEpoch: local.libraryEpoch,
    responderDeviceId: remote.deviceId, responderLibraryEpoch: remote.libraryEpoch };
}

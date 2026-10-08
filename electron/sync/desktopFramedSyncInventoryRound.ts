import {
  FRAMED_SYNC_PROTOCOL_VERSION
} from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
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
  const local = { deviceId: args.peer.local_device_id, libraryEpoch: args.localLibraryEpoch };
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
  const inventories = await exchangeDesktopFramedSyncInventoryHttp(exchange);
  const inbound = {
    ...exchange,
    roundId: inventories.roundId,
    staging: runtime.staging
  };
  if (args.restoreId || adoption) {
    return runVerifiedDesktopFramedSyncRestoreRound({
      ...(adoption ? { adoption } : {}),
      ...(args.restoreId && !adoption ? { restoreId: args.restoreId } : {}),
      inventories,
      inbound,
      exchange
    });
  }
  const differences = compareFramedSyncInventories(inventories);
  const endpoint = createDesktopFramedSyncRoundEndpoint({
    db: runtime.db, groupId: args.peer.group_id, groupSecret: runtime.groupSecret,
    local, peer: remote, peerOrigin: args.peer.endpoint_url, staging: runtime.staging
  });
  const database = await transferDifferences(differences, endpoint, inbound, framedSyncOrderBodyDependencies(inventories));
  const resources = await runDesktopFramedSyncResourceRound(inbound, resourceScope(inventories));
  return { ...database, databaseComplete: database.complete, resources,
    complete: database.complete && resources.pending === 0 };
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
  differences: ReturnType<typeof compareFramedSyncInventories>,
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

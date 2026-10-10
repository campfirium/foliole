import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { iterateFramedSyncDatabaseDifferences } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';

import { createDesktopFramedSyncDifferenceBatchDelivery } from './desktopFramedSyncDifferenceBatchDelivery.js';
import { createDesktopFramedSyncInboundBatchDelivery } from './desktopFramedSyncInboundBatchRound.js';
import type { InboundRound } from './desktopFramedSyncInboundRound.js';
import type { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';

/** Batch caches own only the current window; fixed source identities remain in the inventory. */
export function createDesktopFramedSyncWindowDelivery(
  inventories: Parameters<typeof iterateFramedSyncDatabaseDifferences>[0],
  endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>, inbound: InboundRound
) {
  const iterator = iterateFramedSyncDatabaseDifferences(inventories);
  const first = iterator.next();
  if (first.done) return null;
  let local = createDesktopFramedSyncDifferenceBatchDelivery([], endpoint);
  let remote = createDesktopFramedSyncInboundBatchDelivery([], inbound);
  function* differences() {
    let next: IteratorResult<FramedSyncInventoryDifference, void> = first;
    for (;;) {
      const window: FramedSyncInventoryDifference[] = [];
      while (!next.done && window.length < FRAMED_SYNC_BATCH_LIMITS.maxItems) {
        window.push(next.value);
        next = iterator.next();
      }
      if (!window.length) return;
      local = createDesktopFramedSyncDifferenceBatchDelivery(window, endpoint);
      remote = createDesktopFramedSyncInboundBatchDelivery(window, inbound);
      yield* window;
    }
  }
  return { differences: differences(), deliver: (difference: FramedSyncInventoryDifference) =>
    difference.direction === 'local_to_remote' ? local(difference) : remote(difference) };
}

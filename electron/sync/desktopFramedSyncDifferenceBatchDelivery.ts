import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { isFramedSyncPublicationBatchReady } from '../../lib/core/sync/framedSyncBatchReadiness.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';

import type { createDesktopFramedSyncRoundEndpoint } from './desktopFramedSyncRoundEndpoint.js';

type Delivery = Readonly<{ sent: boolean; state: 'delivered' | 'deferred' }>;

/** Dependency retries enter the same callback; only completed deliveries are cached. */
export function createDesktopFramedSyncDifferenceBatchDelivery(
  differences: readonly FramedSyncInventoryDifference[], endpoint: ReturnType<typeof createDesktopFramedSyncRoundEndpoint>
) {
  const indexes = new Map(differences.map((difference, index) => [difference, index]));
  const results = new Map<FramedSyncInventoryDifference, Delivery>();
  const dependencyErrors = new Map<FramedSyncInventoryDifference, unknown>();
  return async (difference: FramedSyncInventoryDifference): Promise<Delivery> => {
    if (dependencyErrors.has(difference)) {
      const error = dependencyErrors.get(difference);
      dependencyErrors.delete(difference);
      throw error;
    }
    const previous = results.get(difference);
    if (previous) return previous;
    const index = indexes.get(difference);
    const candidates = index === undefined ? [difference] : sameDirectionPrefix(differences, index);
    const selected: FramedSyncInventoryDifference[] = [];
    let requested: Delivery | undefined;
    async function* publications() {
      for (const item of candidates) {
        if (results.has(item) || dependencyErrors.has(item)) continue;
        const selection = await endpoint.selectOutbound(item);
        if (selection.kind === 'deferred') {
          if (item === difference) requested = { sent: false, state: 'deferred' };
          continue;
        }
        const ready = isFramedSyncPublicationBatchReady(selection.publication);
        if (!ready && item !== difference) break;
        await endpoint.staging.publishOutbound(selection.publication);
        selected.push(item);
        yield selection.publication;
        if (!ready) return;
      }
    }
    const states = await endpoint.sendPublishedTransfers(publications());
    if (states.length !== selected.length) throw new Error('framed_sync_batch_result_count_invalid');
    for (let offset = 0; offset < selected.length; offset += 1) {
      const item = selected[offset]!;
      const outcome = states[offset]!;
      if (outcome.state === 'deferred') {
        dependencyErrors.set(item, outcome.error);
        continue;
      }
      const result: Delivery = { sent: true, state: outcome.state === 'committed' ? 'delivered' : 'deferred' };
      if (result.state === 'delivered') results.set(item, result);
      if (item === difference) requested = result;
    }
    if (dependencyErrors.has(difference)) {
      const error = dependencyErrors.get(difference);
      dependencyErrors.delete(difference);
      throw error;
    }
    const result = requested ?? results.get(difference);
    if (!result) throw new Error('framed_sync_batch_result_missing');
    return result;
  };
}

function sameDirectionPrefix(differences: readonly FramedSyncInventoryDifference[], index: number) {
  const result: FramedSyncInventoryDifference[] = [];
  for (const item of differences.slice(index, index + FRAMED_SYNC_BATCH_LIMITS.maxItems)) {
    if (item.direction !== 'local_to_remote') break;
    result.push(item);
  }
  return result;
}

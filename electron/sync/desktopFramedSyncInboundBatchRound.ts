import { FRAMED_SYNC_BATCH_LIMITS } from '../../lib/core/sync/framedSyncBatchLimits.js';
import { FRAMED_SYNC_LIMITS } from '../../lib/core/sync/framedSyncContract.js';
import { projectFramedSyncDifferenceRequest } from '../../lib/core/sync/framedSyncDifferenceRequest.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncMissingDependency } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';

import { requestDesktopFramedSyncDifferenceHttp, requestDesktopFramedSyncDifferencesHttp } from './desktopFramedSyncDifferenceHttp.js';
import { isRetryableInboundRace, receiveDesktopFramedSyncRoundStream, type InboundRound } from './desktopFramedSyncInboundRound.js';

type Delivery = Readonly<{ sent: boolean; state: 'delivered' | 'deferred' }>;

/** Clean EOF acknowledges only the returned prefix; the remaining requests are still pending. */
export function createDesktopFramedSyncInboundBatchDelivery(
  differences: readonly FramedSyncInventoryDifference[], input: InboundRound
) {
  const completed = new Set<FramedSyncInventoryDifference>();
  const indexes = new Map(differences.map((difference, index) => [difference, index]));
  return async (difference: FramedSyncInventoryDifference): Promise<Delivery> => {
    if (completed.has(difference)) return { sent: true, state: 'delivered' };
    const requests = requestPrefix(differences, indexes.get(difference), difference, completed, input.roundId);
    let returned = 0;
    let current: Delivery = { sent: false, state: 'deferred' };
    try {
      const streams = await requestDesktopFramedSyncDifferencesHttp({ ...input, differences: requests });
      for await (const stream of streams) {
        const requested = requests[returned++];
        if (!requested) throw new Error('framed_sync_batch_response_unexpected');
        const state = await receiveDesktopFramedSyncRoundStream(input, stream, requested);
        if (state === 'committed') completed.add(requested);
        if (requested === difference) current = { sent: true, state: state === 'committed' ? 'delivered' : 'deferred' };
      }
      return current;
    } catch (error) {
      if (readFramedSyncMissingDependency(error)) {
        if (returned > 1) return current;
        if (returned === 0 && requests.length > 1) return receiveIndividual(input, difference);
      }
      if (isRetryableInboundRace(error)) return current;
      throw error;
    }
  };
}

async function receiveIndividual(input: InboundRound, difference: FramedSyncInventoryDifference): Promise<Delivery> {
  try {
    const stream = await requestDesktopFramedSyncDifferenceHttp({ ...input, difference });
    const state = await receiveDesktopFramedSyncRoundStream(input, stream, difference);
    return { sent: true, state: state === 'committed' ? 'delivered' : 'deferred' };
  } catch (error) {
    if (isRetryableInboundRace(error)) return { sent: false, state: 'deferred' };
    throw error;
  }
}

function requestPrefix(differences: readonly FramedSyncInventoryDifference[], index: number | undefined,
  current: FramedSyncInventoryDifference, completed: ReadonlySet<FramedSyncInventoryDifference>, roundId: Uint8Array) {
  const requests: FramedSyncInventoryDifference[] = [];
  let bytes = 0;
  for (const difference of index === undefined ? [current] : differences.slice(index)) {
    if (difference.direction !== 'remote_to_local' || requests.length === FRAMED_SYNC_BATCH_LIMITS.maxItems) break;
    if (completed.has(difference)) continue;
    const size = projectFramedSyncDifferenceRequest({ difference, roundId }).encoded.byteLength;
    if (bytes + size > FRAMED_SYNC_LIMITS.maxControlMessageBytes) {
      if (!requests.length) throw new Error('framed_sync_batch_request_limit_exceeded');
      break;
    }
    bytes += size;
    requests.push(difference);
  }
  if (!requests.length) throw new Error('framed_sync_batch_request_missing');
  return requests;
}

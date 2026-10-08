import { FRAMED_SYNC_BATCH_LIMITS } from './framedSyncBatchLimits.js';

/** Greedy stable packing; a large transfer keeps the original individual streaming path. */
export async function* packFramedSyncTransfers<T>(source: AsyncIterable<T>, messageBytes: (item: T) => number | null) {
  let pending: T[] = [];
  let bytes = 0;
  for await (const item of source) {
    const size = messageBytes(item);
    if (size === null) {
      if (pending.length) yield pending;
      pending = [];
      bytes = 0;
      yield [item];
      continue;
    }
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('framed_sync_batch_size_invalid');
    if (pending.length && (pending.length === FRAMED_SYNC_BATCH_LIMITS.maxItems ||
        bytes + size > FRAMED_SYNC_BATCH_LIMITS.targetMessageBytes)) {
      yield pending;
      pending = [];
      bytes = 0;
    }
    if (size >= FRAMED_SYNC_BATCH_LIMITS.targetMessageBytes) {
      yield [item];
    } else {
      pending.push(item);
      bytes += size;
    }
  }
  if (pending.length) yield pending;
}

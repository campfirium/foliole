import { FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES, type FramedSyncPayloadBudget,
  type FramedSyncPayloadDirection } from './framedSyncPayloadBudget.js';

/** Reserve the bounded frame capacity before a source reads or encodes its next payload. */
export async function* leaseFramedSyncPayloads<T>(source: AsyncIterable<T> | Iterable<T>,
  budget: FramedSyncPayloadBudget | undefined, direction: FramedSyncPayloadDirection): AsyncGenerator<T> {
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  try {
    for (;;) {
      const lease = await budget?.acquire({ direction, bytes: FRAMED_SYNC_DIRECTION_PAYLOAD_BYTES });
      try {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      } finally { lease?.release(); }
    }
  } finally { await iterator.return?.(); }
}

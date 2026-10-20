import { FRAMED_SYNC_PAYLOAD_SLOT_BYTES, type FramedSyncPayloadBudget,
  type FramedSyncPayloadDirection } from './framedSyncPayloadBudget.js';

/** Reserve the bounded frame capacity before a source reads or encodes its next payload. */
export async function* leaseFramedSyncPayloads<T>(source: AsyncIterable<T> | Iterable<T>,
  budget: FramedSyncPayloadBudget | undefined, direction: FramedSyncPayloadDirection,
  onTiming?: (phase: 'budget_wait' | 'source_read', durationMs: number) => void): AsyncGenerator<T> {
  const iterator = Symbol.asyncIterator in source ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  try {
    for (;;) {
      const acquiring = onTiming ? performance.now() : 0;
      const lease = await budget?.acquire({ direction, bytes: FRAMED_SYNC_PAYLOAD_SLOT_BYTES });
      try {
        onTiming?.('budget_wait', performance.now() - acquiring);
        const reading = onTiming ? performance.now() : 0;
        const next = await iterator.next();
        onTiming?.('source_read', performance.now() - reading);
        if (next.done) return;
        yield next.value;
      } finally { lease?.release(); }
    }
  } finally { await iterator.return?.(); }
}

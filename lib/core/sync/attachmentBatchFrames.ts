import type { FramedSyncEncodedFrame } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_PAYLOAD_SLOT_BYTES, type FramedSyncPayloadBudget } from './framedSyncPayloadBudget.js';

/** One frame being sent and one being prepared, each charged before reading or encryption starts. */
export async function* pipelineAttachmentBatchFrames(source: AsyncIterable<FramedSyncEncodedFrame>,
  budget: FramedSyncPayloadBudget | undefined, signal?: AbortSignal): AsyncGenerator<FramedSyncEncodedFrame> {
  const iterator = source[Symbol.asyncIterator]();
  const read = async () => {
    signal?.throwIfAborted();
    const lease = await budget?.acquire({ direction: 'outbound', bytes: FRAMED_SYNC_PAYLOAD_SLOT_BYTES,
      ...(signal ? { signal } : {}) });
    try {
      signal?.throwIfAborted();
      const next = await iterator.next();
      signal?.throwIfAborted();
      return { lease, next };
    } catch (error) { lease?.release(); throw error; }
  };
  let pending: ReturnType<typeof read> | undefined;
  try {
    pending = read();
    for (;;) {
      const current = await pending;
      pending = undefined;
      if (current.next.done) { current.lease?.release(); return; }
      if (!current.next.value.attachmentBoundary) pending = read();
      void pending?.catch(() => {});
      try { signal?.throwIfAborted(); yield current.next.value; }
      finally { current.lease?.release(); }
      pending ??= read();
    }
  } finally {
    const abandoned = await pending?.catch(() => undefined);
    abandoned?.lease?.release();
    await iterator.return?.();
  }
}

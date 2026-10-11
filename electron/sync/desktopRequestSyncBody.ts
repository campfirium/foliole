import { REQUEST_SYNC_MEMORY_BYTES } from '../../lib/core/sync/requestSyncFiles.js';

import { spoolDesktopFramedSyncBody } from './desktopFramedSyncBodySpool.js';
import { framedSyncEncodedLength, framedSyncEncodedSha256,
  type FramedSyncEncodedFrame, type FramedSyncWritableBody } from './desktopFramedSyncStream.js';

/** Small one-shot HTTP bodies need signing bytes, but no filesystem publication. */
export async function prepareDesktopRequestSyncBody(
  input: Parameters<typeof spoolDesktopFramedSyncBody>[0]
): Promise<FramedSyncWritableBody> {
  const frames: FramedSyncEncodedFrame[] = [];
  const iterator = input.frames[Symbol.asyncIterator]();
  let bytes = input.preamble.length;
  try {
    for (;;) {
      const next = await iterator.next();
      if (next.done) break;
      const frame = { headerBytes: Uint8Array.from(next.value.headerBytes), ciphertext: Uint8Array.from(next.value.ciphertext) };
      frames.push(frame);
      bytes += frame.headerBytes.length + frame.ciphertext.length;
      if (bytes > REQUEST_SYNC_MEMORY_BYTES) {
        return await spoolDesktopFramedSyncBody({ ...input, frames: (async function* () {
          yield* frames;
          frames.length = 0;
          for (;;) {
            const remaining = await iterator.next();
            if (remaining.done) return;
            yield remaining.value;
          }
        })() });
      }
    }
    return { preamble: Uint8Array.from(input.preamble),
      contentLength: framedSyncEncodedLength(input.preamble, frames),
      bodySha256: framedSyncEncodedSha256(input.preamble, frames),
      frames: (async function* () { yield* frames; })(),
      dispose: async () => { frames.length = 0; }
    };
  } catch (error) {
    frames.length = 0;
    throw error;
  } finally { await iterator.return?.(); }
}

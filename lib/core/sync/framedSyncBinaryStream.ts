
import {
  FRAMED_SYNC_LIMITS
} from './framedSyncContract.js';
import { FramedSyncExactByteReader, type FramedSyncBinaryChunk } from './framedSyncExactByteReader.js';
import {
  decodeFrameHeader,
  decodeFramedSyncPreamble,
  type FramedSyncFrameHeader
} from './framedSyncFraming.js';
import type { FramedSyncPayloadBudget } from './framedSyncPayloadBudget.js';
import { readFramedSyncWireFrames } from './framedSyncWireFrameReader.js';

export type FramedSyncWireFrame = Readonly<{
  ciphertext: Uint8Array;
  header: FramedSyncFrameHeader;
  headerBytes: Uint8Array;
}>;

export type FramedSyncEncodedFrame = Readonly<{
  ciphertext: Uint8Array;
  headerBytes: Uint8Array;
}>;

export type FramedSyncStreamBody<Frame extends FramedSyncEncodedFrame = FramedSyncEncodedFrame> = Readonly<{
  frames: AsyncIterable<Frame>;
  preamble: Uint8Array;
  /** Already validated wire bytes, borrowed until the HTTP consumer requests the next chunk. */
  encodedBytes?: AsyncIterable<Uint8Array>;
}>;

export type FramedSyncWritableBody = FramedSyncStreamBody & Readonly<{
  bodySha256: string;
  contentLength: number;
  uncompressedMessageBytes?: number | undefined;
  dispose?: () => Promise<void>;
}>;

export async function readFramedSyncStream(
  source: AsyncIterable<FramedSyncBinaryChunk>,
  payloadBudget?: FramedSyncPayloadBudget,
  /** Borrowed ciphertext remains valid until the consumer requests the next frame. */
  options?: Readonly<{ reuseCiphertext: true }>
): Promise<FramedSyncStreamBody<FramedSyncWireFrame>> {
  const reader = new FramedSyncExactByteReader(source[Symbol.asyncIterator]());
  try {
    const preamble = await reader.read(
      FRAMED_SYNC_LIMITS.preambleBytes,
      'framed_sync_preamble_truncated'
    );
    decodeFramedSyncPreamble(preamble);
    return { preamble, frames: readFrames(reader, payloadBudget, options?.reuseCiphertext === true) };
  } catch (error) {
    await reader.close();
    throw error;
  }
}

async function* readFrames(reader: FramedSyncExactByteReader, payloadBudget?: FramedSyncPayloadBudget,
  reuseCiphertext = false): AsyncGenerator<FramedSyncWireFrame> {
  try { yield* readFramedSyncWireFrames({ reader, payloadBudget, reuseCiphertext }); }
  finally { await reader.close(); }
}

export async function* encodeFramedSyncStream(
  body: FramedSyncStreamBody & { dispose?: () => Promise<void> }
): AsyncGenerator<Uint8Array> {
  try {
    decodeFramedSyncPreamble(body.preamble);
    yield body.preamble;
    for await (const frame of body.frames) {
      const header = decodeFrameHeader(frame.headerBytes);
      if (frame.ciphertext.byteLength !== header.ciphertextBytes) {
        throw new Error('framed_sync_frame_body_length_mismatch');
      }
      yield frame.headerBytes;
      yield frame.ciphertext;
    }
  } finally { await body.dispose?.(); }
}

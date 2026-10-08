import { createHash } from 'node:crypto';


import {
  FRAMED_SYNC_LIMITS
} from '../../lib/core/sync/framedSyncContract.js';
import {
  decodeFrameHeader,
  decodeFramedSyncPreamble,
  type FramedSyncFrameHeader
} from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';

import { FramedSyncExactByteReader, type FramedSyncBinaryChunk } from './framedSyncExactByteReader.js';
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

export function framedSyncEncodedLength(
  preamble: Uint8Array,
  frames: readonly Readonly<{
    ciphertext: Uint8Array;
    frameHeader?: Uint8Array;
    headerBytes?: Uint8Array;
  }>[]
) {
  decodeFramedSyncPreamble(preamble);
  return frames.reduce((total, frame) => {
    const headerBytes = frame.headerBytes ?? frame.frameHeader;
    if (!headerBytes) throw new Error('framed_sync_frame_header_missing');
    const header = decodeFrameHeader(headerBytes);
    if (frame.ciphertext.byteLength !== header.ciphertextBytes) {
      throw new Error('framed_sync_frame_body_length_mismatch');
    }
    return total + headerBytes.byteLength + frame.ciphertext.byteLength;
  }, preamble.byteLength);
}

export function framedSyncEncodedSha256(
  preamble: Uint8Array,
  frames: readonly Readonly<{
    ciphertext: Uint8Array;
    frameHeader?: Uint8Array;
    headerBytes?: Uint8Array;
  }>[]
) {
  decodeFramedSyncPreamble(preamble);
  const hash = createHash('sha256').update(preamble);
  for (const frame of frames) {
    const headerBytes = frame.headerBytes ?? frame.frameHeader;
    if (!headerBytes) throw new Error('framed_sync_frame_header_missing');
    const header = decodeFrameHeader(headerBytes);
    if (frame.ciphertext.byteLength !== header.ciphertextBytes) {
      throw new Error('framed_sync_frame_body_length_mismatch');
    }
    hash.update(headerBytes).update(frame.ciphertext);
  }
  return hash.digest('hex');
}

export async function inspectFramedSyncEncodedStream(
  preamble: Uint8Array,
  frames: AsyncIterable<FramedSyncEncodedFrame>
) {
  decodeFramedSyncPreamble(preamble);
  const hash = createHash('sha256').update(preamble);
  let contentLength = preamble.byteLength;
  for await (const frame of frames) {
    const header = decodeFrameHeader(frame.headerBytes);
    if (frame.ciphertext.byteLength !== header.ciphertextBytes) {
      throw new Error('framed_sync_frame_body_length_mismatch');
    }
    hash.update(frame.headerBytes).update(frame.ciphertext);
    contentLength += frame.headerBytes.byteLength + frame.ciphertext.byteLength;
  }
  return { bodySha256: hash.digest('hex'), contentLength };
}

import { createHash } from 'node:crypto';

import {
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PREAMBLE
} from '../../lib/core/sync/framedSyncContract.js';
import {
  decodeFrameHeader,
  decodeFramedSyncPreamble,
  type FramedSyncFrameHeader
} from '../../lib/core/sync/framedSyncFraming.js';

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
}>;

export type FramedSyncWritableBody = FramedSyncStreamBody & Readonly<{
  bodySha256: string;
  contentLength: number;
}>;

type BinaryChunk = Uint8Array | string;

class ExactByteReader {
  private buffered: Uint8Array = new Uint8Array();
  private offset = 0;

  constructor(private readonly iterator: AsyncIterator<BinaryChunk>) {}

  async read(length: number, truncatedError: string, allowCleanEnd?: false): Promise<Uint8Array>;
  async read(length: number, truncatedError: string, allowCleanEnd: true): Promise<Uint8Array | null>;
  async read(length: number, truncatedError: string,
    allowCleanEnd = false): Promise<Uint8Array | null> {
    const result = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      if (this.offset === this.buffered.byteLength) {
        const next = await this.iterator.next();
        if (next.done) {
          if (allowCleanEnd && written === 0) return null;
          throw new Error(truncatedError);
        }
        this.buffered = typeof next.value === 'string' ? Buffer.from(next.value) : next.value;
        this.offset = 0;
        if (this.buffered.byteLength === 0) continue;
      }
      const count = Math.min(length - written, this.buffered.byteLength - this.offset);
      result.set(this.buffered.subarray(this.offset, this.offset + count), written);
      written += count;
      this.offset += count;
    }
    return result;
  }

  async close() {
    this.buffered = new Uint8Array();
    this.offset = 0;
    await this.iterator.return?.();
  }
}

export async function readFramedSyncStream(
  source: AsyncIterable<BinaryChunk>
): Promise<FramedSyncStreamBody<FramedSyncWireFrame>> {
  const reader = new ExactByteReader(source[Symbol.asyncIterator]());
  try {
    const preamble = await reader.read(
      FRAMED_SYNC_LIMITS.preambleBytes,
      'framed_sync_preamble_truncated'
    );
    decodeFramedSyncPreamble(preamble);
    return { preamble, frames: readFrames(reader) };
  } catch (error) {
    await reader.close();
    throw error;
  }
}

async function* readFrames(reader: ExactByteReader): AsyncGenerator<FramedSyncWireFrame> {
  try {
    for (;;) {
      const headerBytes = await reader.read(
        FRAMED_SYNC_PREAMBLE.frameHeaderBytes,
        'framed_sync_frame_header_truncated',
        true
      );
      if (!headerBytes) return;
      const header = decodeFrameHeader(headerBytes);
      const ciphertext = await reader.read(
        header.ciphertextBytes,
        'framed_sync_frame_body_truncated'
      );
      yield { ciphertext, header, headerBytes };
    }
  } finally {
    await reader.close();
  }
}

export async function* encodeFramedSyncStream(
  body: FramedSyncStreamBody
): AsyncGenerator<Uint8Array> {
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

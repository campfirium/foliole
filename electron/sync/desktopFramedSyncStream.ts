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
  contentLength: number;
}>;

type BinaryChunk = Uint8Array | string;

class ExactByteReader {
  private buffered = Buffer.alloc(0);
  private ended = false;

  constructor(private readonly iterator: AsyncIterator<BinaryChunk>) {}

  async read(length: number, truncatedError: string, allowCleanEnd?: false): Promise<Uint8Array>;
  async read(length: number, truncatedError: string, allowCleanEnd: true): Promise<Uint8Array | null>;
  async read(length: number, truncatedError: string,
    allowCleanEnd = false): Promise<Uint8Array | null> {
    while (this.buffered.byteLength < length && !this.ended) {
      const next = await this.iterator.next();
      if (next.done) {
        this.ended = true;
      } else {
        const chunk = typeof next.value === 'string'
          ? Buffer.from(next.value)
          : Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength);
        if (chunk.byteLength) this.buffered = Buffer.concat([this.buffered, chunk]);
      }
    }
    if (allowCleanEnd && this.buffered.byteLength === 0 && this.ended) return null;
    if (this.buffered.byteLength < length) throw new Error(truncatedError);
    const result = new Uint8Array(this.buffered.subarray(0, length));
    this.buffered = this.buffered.subarray(length);
    return result;
  }

  async close() {
    await this.iterator.return?.();
  }
}

export async function readFramedSyncStream(
  source: AsyncIterable<BinaryChunk>
): Promise<FramedSyncStreamBody<FramedSyncWireFrame>> {
  const reader = new ExactByteReader(source[Symbol.asyncIterator]());
  const preamble = await reader.read(
    FRAMED_SYNC_LIMITS.preambleBytes,
    'framed_sync_preamble_truncated'
  );
  decodeFramedSyncPreamble(preamble);
  return { preamble, frames: readFrames(reader) };
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

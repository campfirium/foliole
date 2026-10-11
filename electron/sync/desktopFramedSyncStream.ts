import { createHash } from 'node:crypto';

import type { FramedSyncEncodedFrame } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { decodeFrameHeader, decodeFramedSyncPreamble } from '../../lib/core/sync/framedSyncFraming.js';

export { encodeFramedSyncStream, readFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
export type { FramedSyncWireFrame, FramedSyncEncodedFrame, FramedSyncStreamBody,
  FramedSyncWritableBody } from '../../lib/core/sync/framedSyncBinaryStream.js';

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

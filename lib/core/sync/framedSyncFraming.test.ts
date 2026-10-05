import { expect, it } from 'vitest';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import {
  decodeFrameHeader,
  decodeFramedSyncPreamble,
  encodeFrameHeader,
  encodeFramedSyncPreamble,
  frameAad,
  frameNonce,
  type FramedSyncPreamble
} from './framedSyncFraming.js';

const preamble = (): FramedSyncPreamble => ({
  attemptId: new Uint8Array(16).fill(0x22),
  compression: 'gzip',
  contextId: new Uint8Array(32).fill(0x11),
  contextKind: 'transfer',
  noncePrefix: Uint8Array.from([1, 2, 3, 4]),
  startingSequence: 0n
});

it('round-trips the fixed preamble and authenticated frame header', () => {
  const encodedPreamble = encodeFramedSyncPreamble(preamble());
  const encodedHeader = encodeFrameHeader({ ciphertextBytes: 512, flags: 0, frameType: 3, sequence: 9n });
  expect(encodedPreamble).toHaveLength(96);
  expect(encodedHeader).toHaveLength(16);
  expect(decodeFramedSyncPreamble(encodedPreamble)).toEqual(preamble());
  expect(decodeFrameHeader(encodedHeader)).toEqual({ ciphertextBytes: 512, flags: 0, frameType: 3, sequence: 9n });
  expect(frameAad(encodedPreamble, encodedHeader)).toHaveLength(112);
  expect(frameNonce(preamble().noncePrefix, 9n)).toEqual(
    Uint8Array.from([1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 9])
  );
});

it('uses the same fixed preamble slot for a session id', () => {
  const session: FramedSyncPreamble = {
    compression: 'none', contextId: new Uint8Array(32).fill(0x33), contextKind: 'session',
    noncePrefix: new Uint8Array(4), sessionId: new Uint8Array(16).fill(0x44), startingSequence: 0n
  };
  expect(decodeFramedSyncPreamble(encodeFramedSyncPreamble(session))).toEqual(session);
});

it('rejects an oversized frame from its header before payload allocation', () => {
  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  view.setUint32(0, FRAMED_SYNC_LIMITS.maxCiphertextBodyBytes + 1);
  view.setUint16(12, 3);
  expect(() => decodeFrameHeader(header)).toThrow('wire_frame_limit_exceeded');
});

it('rejects non-zero reserved preamble bytes', () => {
  const encoded = encodeFramedSyncPreamble(preamble());
  encoded[95] = 1;
  expect(() => decodeFramedSyncPreamble(encoded)).toThrow('framed_sync_preamble_invalid');
});

it('rejects non-zero v22 frame flags', () => {
  expect(() => encodeFrameHeader({ ciphertextBytes: 16, flags: 1, frameType: 3, sequence: 0n }))
    .toThrow('framed_sync_frame_header_invalid');
});

import { gunzipSync, gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { encryptFrame } from './framedSyncCrypto.js';
import {
  encodeFrameHeader,
  encodeFramedSyncPreamble,
  frameAad,
  frameNonce
} from './framedSyncFraming.js';
import {
  assertDecodedFrameType,
  assertDecodedPayloadType,
  assertFramePayloadBudget,
  collectDecompressedChunks,
  frameTypeForPayload,
  receiveFramedSyncFrame
} from './framedSyncReceiver.js';

const key = new Uint8Array(32).fill(0x11);
const noncePrefix = Uint8Array.from([1, 2, 3, 4]);

async function* testGzipDecoder(compressed: Uint8Array) {
  yield new Uint8Array(gunzipSync(compressed));
}

async function encryptedFrame(plaintext: Uint8Array, compression: 'gzip' | 'none' = 'none') {
  const preamble = encodeFramedSyncPreamble({
    attemptId: new Uint8Array(16).fill(0x22), compression,
    contextId: new Uint8Array(32).fill(0x33), contextKind: 'transfer',
    noncePrefix, startingSequence: 0n
  });
  const header = encodeFrameHeader({
    ciphertextBytes: plaintext.byteLength + 16, flags: 0,
    frameType: FRAMED_SYNC_FRAME_TYPES.fact, sequence: 0n
  });
  const ciphertext = await encryptFrame({
    aad: frameAad(preamble, header), key, nonce: frameNonce(noncePrefix, 0n), plaintext
  });
  return { ciphertext, header, preamble };
}

describe('framed sync authenticated receiver', () => {
  it('authenticates one exact sequence and exposes the bound payload type', async () => {
    const encoded = new TextEncoder().encode('fact');
    const frame = await encryptedFrame(encoded);
    const received = await receiveFramedSyncFrame({
      ciphertext: frame.ciphertext, expectedSequence: 0n,
      frameHeader: frame.header, key, preamble: frame.preamble
    });
    expect(received.frameType).toBe(FRAMED_SYNC_FRAME_TYPES.fact);
    expect(received.nextSequence).toBe(1n);
    expect([...received.plaintext]).toEqual([...encoded]);
    expect(() => assertDecodedFrameType(received.frameType, FRAMED_SYNC_FRAME_TYPES.blobChunk))
      .toThrow('frame_payload_type_mismatch');
    expect(() => assertDecodedPayloadType(received.frameType, 'fact')).not.toThrow();
    expect(frameTypeForPayload('handshake')).toBe(FRAMED_SYNC_FRAME_TYPES.sessionControl);
    const gzipFrame = await encryptedFrame(new Uint8Array(gzipSync(encoded)), 'gzip');
    const decompressed = await receiveFramedSyncFrame({
      ciphertext: gzipFrame.ciphertext, expectedSequence: 0n,
      decompressGzip: testGzipDecoder,
      frameHeader: gzipFrame.header, key, preamble: gzipFrame.preamble
    });
    expect([...decompressed.plaintext]).toEqual([...encoded]);
  });

  it('rejects a sequence gap and authenticated metadata tampering', async () => {
    const frame = await encryptedFrame(new TextEncoder().encode('fact'));
    await expect(receiveFramedSyncFrame({
      ciphertext: frame.ciphertext, expectedSequence: 1n,
      frameHeader: frame.header, key, preamble: frame.preamble
    })).rejects.toThrow('frame_sequence_not_contiguous');
    const tamperedHeader = frame.header.slice();
    new DataView(tamperedHeader.buffer).setUint16(12, FRAMED_SYNC_FRAME_TYPES.blobChunk);
    await expect(receiveFramedSyncFrame({
      ciphertext: frame.ciphertext, expectedSequence: 0n,
      frameHeader: tamperedHeader, key, preamble: frame.preamble
    })).rejects.toThrow('frame_authentication_failed');
  });

  it('stops gzip expansion at the decompressed frame limit', async () => {
    async function* expansion() { yield new Uint8Array(64); yield Uint8Array.of(1); }
    await expect(collectDecompressedChunks(expansion(), 64))
      .rejects.toThrow('decompressed_frame_limit_exceeded');
    expect(FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes).toBe(2 * 1024 * 1024);
  });
});

describe('framed sync authenticated payload budgets', () => {
  it('enforces the authenticated control payload budget after decryption', async () => {
    const plaintext = new Uint8Array(FRAMED_SYNC_LIMITS.maxControlMessageBytes + 1);
    const sessionId = new Uint8Array(16).fill(0x44);
    const preamble = encodeFramedSyncPreamble({
      compression: 'none', contextId: new Uint8Array(32).fill(0x55), contextKind: 'session',
      noncePrefix, sessionId, startingSequence: 0n
    });
    const header = encodeFrameHeader({
      ciphertextBytes: plaintext.byteLength + 16, flags: 0,
      frameType: FRAMED_SYNC_FRAME_TYPES.sessionControl, sequence: 0n
    });
    const ciphertext = await encryptFrame({
      aad: frameAad(preamble, header), key, nonce: frameNonce(noncePrefix, 0n), plaintext
    });
    await expect(receiveFramedSyncFrame({ ciphertext, frameHeader: header, key, preamble }))
      .rejects.toThrow('frame_payload_limit_exceeded');
    expect(() => assertFramePayloadBudget(
      FRAMED_SYNC_FRAME_TYPES.sessionControl,
      FRAMED_SYNC_LIMITS.maxControlMessageBytes
    )).not.toThrow();
  });

  it('bounds the entire decompressed transfer header message', () => {
    expect(() => assertFramePayloadBudget(
      FRAMED_SYNC_FRAME_TYPES.transferHeader,
      FRAMED_SYNC_LIMITS.maxManifestBytes
    )).not.toThrow();
    expect(() => assertFramePayloadBudget(
      FRAMED_SYNC_FRAME_TYPES.transferHeader,
      FRAMED_SYNC_LIMITS.maxManifestBytes + 1
    )).toThrow('frame_payload_limit_exceeded');
  });
});

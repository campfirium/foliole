import {
  assertAttemptId,
  assertFrameLengths,
  assertFramedSyncDigest,
  assertNoncePrefix,
  assertSessionId,
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PREAMBLE,
  FRAMED_SYNC_PROTOCOL_VERSION
} from './framedSyncContract.js';

export type FrameContextKind = 'session' | 'transfer';

type PreambleBase = Readonly<{
  compression: 'gzip' | 'none';
  contextId: Uint8Array;
  noncePrefix: Uint8Array;
  startingSequence: bigint;
}>;

export type FramedSyncPreamble = PreambleBase & (
  | Readonly<{ contextKind: 'session'; sessionId: Uint8Array }>
  | Readonly<{ attemptId: Uint8Array; contextKind: 'transfer' }>
);

export type FramedSyncFrameHeader = Readonly<{
  ciphertextBytes: number;
  flags: number;
  frameType: number;
  sequence: bigint;
}>;

const encoder = new TextEncoder();
const magic = encoder.encode(FRAMED_SYNC_PREAMBLE.magic);

export function encodeFramedSyncPreamble(value: FramedSyncPreamble) {
  const result = new Uint8Array(FRAMED_SYNC_LIMITS.preambleBytes);
  const view = new DataView(result.buffer);
  result.set(magic, 0);
  view.setUint16(8, FRAMED_SYNC_LIMITS.preambleBytes);
  view.setUint16(10, FRAMED_SYNC_PROTOCOL_VERSION);
  view.setUint8(12, value.contextKind === 'session' ? 1 : 2);
  view.setUint8(13, value.compression === 'none' ? 0 : 1);
  result.set(assertFramedSyncDigest(value.contextId, 'context_id'), 16);
  result.set(value.contextKind === 'session'
    ? assertSessionId(value.sessionId)
    : assertAttemptId(value.attemptId), 48);
  result.set(assertNoncePrefix(value.noncePrefix), 64);
  view.setBigUint64(68, value.startingSequence);
  return result;
}

export function decodeFramedSyncPreamble(value: Uint8Array): FramedSyncPreamble {
  if (value.byteLength !== FRAMED_SYNC_LIMITS.preambleBytes ||
      !magic.every((byte, index) => value[index] === byte)) throw new Error('framed_sync_preamble_invalid');
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  if (view.getUint16(8) !== FRAMED_SYNC_LIMITS.preambleBytes ||
      view.getUint16(10) !== FRAMED_SYNC_PROTOCOL_VERSION ||
      !value.slice(76).every((byte) => byte === 0)) throw new Error('framed_sync_preamble_invalid');
  const kind = view.getUint8(12);
  const compression = view.getUint8(13);
  if ((kind !== 1 && kind !== 2) || (compression !== 0 && compression !== 1) ||
      view.getUint16(14) !== 0) throw new Error('framed_sync_preamble_invalid');
  const base: PreambleBase = {
    compression: compression === 0 ? 'none' : 'gzip',
    contextId: value.slice(16, 48),
    noncePrefix: value.slice(64, 68),
    startingSequence: view.getBigUint64(68)
  };
  return kind === 1
    ? { ...base, contextKind: 'session', sessionId: value.slice(48, 64) }
    : { ...base, attemptId: value.slice(48, 64), contextKind: 'transfer' };
}

export function encodeFrameHeader(value: FramedSyncFrameHeader) {
  assertFrameLengths({ ciphertextBytes: value.ciphertextBytes, decompressedBytes: 0 });
  if (!Number.isInteger(value.frameType) || value.frameType <= 0 || value.frameType > 0xffff ||
      value.flags !== 0) {
    throw new Error('framed_sync_frame_header_invalid');
  }
  const result = new Uint8Array(FRAMED_SYNC_PREAMBLE.frameHeaderBytes);
  const view = new DataView(result.buffer);
  view.setUint32(0, value.ciphertextBytes);
  view.setBigUint64(4, value.sequence);
  view.setUint16(12, value.frameType);
  view.setUint16(14, value.flags);
  return result;
}

export function decodeFrameHeader(value: Uint8Array): FramedSyncFrameHeader {
  if (value.byteLength !== FRAMED_SYNC_PREAMBLE.frameHeaderBytes) {
    throw new Error('framed_sync_frame_header_invalid');
  }
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const result = {
    ciphertextBytes: view.getUint32(0), flags: view.getUint16(14),
    frameType: view.getUint16(12), sequence: view.getBigUint64(4)
  };
  assertFrameLengths({ ciphertextBytes: result.ciphertextBytes, decompressedBytes: 0 });
  if (result.frameType === 0 || result.flags !== 0) throw new Error('framed_sync_frame_header_invalid');
  return result;
}

export function frameNonce(prefix: Uint8Array, sequence: bigint) {
  const result = new Uint8Array(12);
  result.set(assertNoncePrefix(prefix));
  new DataView(result.buffer).setBigUint64(4, sequence);
  return result;
}

export function frameAad(preamble: Uint8Array, header: Uint8Array) {
  decodeFramedSyncPreamble(preamble);
  decodeFrameHeader(header);
  const result = new Uint8Array(preamble.byteLength + header.byteLength);
  result.set(preamble);
  result.set(header, preamble.byteLength);
  return result;
}

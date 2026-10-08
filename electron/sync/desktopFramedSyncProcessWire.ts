import { randomBytes } from 'node:crypto';

import {
  FRAMED_SYNC_FRAME_TYPES,
  type PreparedTransferAttempt,
  type StoredEncryptedFrame
} from '../../lib/core/sync/framedSyncContract.js';
import { encryptFrame } from '../../lib/core/sync/framedSyncCrypto.js';
import {
  encodeFrameHeader,
  encodeFramedSyncPreamble,
  frameAad,
  frameNonce
} from '../../lib/core/sync/framedSyncFraming.js';
import type { FramedSyncPayloadBudget } from '../../lib/core/sync/framedSyncPayloadBudget.js';
import { leaseFramedSyncPayloads } from '../../lib/core/sync/framedSyncPayloadLease.js';
import { encodeValidatedProtocolMessage } from '../../lib/core/sync/framedSyncProtocolCodec.js';
export {
  blobToWire,
  factToWire,
  manifestToWire,
  wireToBlob,
  wireToFact,
  wireUint64
} from '../../lib/core/sync/framedSyncWireProjection.js';

export function newTransferAttempt(transferId: Uint8Array): PreparedTransferAttempt {
  const attemptId = new Uint8Array(randomBytes(16));
  const noncePrefix = new Uint8Array(randomBytes(4));
  const preamble = encodeFramedSyncPreamble({ attemptId, compression: 'none', contextId: transferId,
    contextKind: 'transfer', noncePrefix, startingSequence: 0n });
  return { attemptId, noncePrefix, preamble, state: 'prepared' };
}

export async function* processFrameStream(
  frames: AsyncIterable<Readonly<{
    ciphertext: Uint8Array;
    frameHeader?: Uint8Array;
    headerBytes?: Uint8Array;
  }>> | Iterable<Readonly<{
    ciphertext: Uint8Array;
    frameHeader?: Uint8Array;
    headerBytes?: Uint8Array;
  }>>,
  payloadBudget?: FramedSyncPayloadBudget
) {
  for await (const frame of leaseFramedSyncPayloads(frames, payloadBudget, 'outbound')) {
    const headerBytes = frame.headerBytes ?? frame.frameHeader;
    if (!headerBytes) throw new Error('framed_sync_frame_header_missing');
    yield { ciphertext: frame.ciphertext, headerBytes };
  }
}

export async function encryptProtocolFrame(input: {
  attempt: PreparedTransferAttempt;
  frameType: number;
  groupKey: Uint8Array;
  payload: unknown;
  payloadCase: Parameters<typeof encodeValidatedProtocolMessage>[0];
  sequence: bigint;
  transferId: Uint8Array;
}, encode = encodeValidatedProtocolMessage): Promise<StoredEncryptedFrame> {
  const { deriveTransferFrameKey } = await import('../../lib/core/sync/framedSyncCrypto.js');
  const plaintext = encode(input.payloadCase, input.payload);
  const frameHeader = encodeFrameHeader({ ciphertextBytes: plaintext.byteLength + 16,
    flags: 0, frameType: input.frameType, sequence: input.sequence });
  const key = await deriveTransferFrameKey({ attemptId: input.attempt.attemptId,
    groupKey: input.groupKey, transferId: input.transferId });
  const ciphertext = await encryptFrame({ aad: frameAad(input.attempt.preamble, frameHeader), key,
    nonce: frameNonce(input.attempt.noncePrefix, input.sequence), plaintext });
  return { ciphertext, frameHeader, frameType: input.frameType, sequence: input.sequence };
}

export const TRANSFER_FRAME_TYPES = FRAMED_SYNC_FRAME_TYPES;

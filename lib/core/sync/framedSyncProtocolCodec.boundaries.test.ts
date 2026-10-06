import protobuf from 'protobufjs';
import { describe, expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import {
  decodeAndValidateProtocolMessage,
  encodeValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';

const digest = (value: number) => new Uint8Array(32).fill(value);
const roundId = () => new Uint8Array(16).fill(1);

function uint64(value: string) {
  const parsed = BigInt(value);
  return {
    high: Number(BigInt.asIntN(32, parsed >> 32n)),
    low: Number(BigInt.asIntN(32, parsed)),
    unsigned: true
  } satisfies protobuf.Long;
}

function canonicalValueAtDepth(depth: number): Record<string, unknown> {
  return depth === 1
    ? { stringValue: 'leaf' }
    : { listValue: { values: [canonicalValueAtDepth(depth - 1)] } };
}

function canonicalObjectValueAtDepth(depth: number): Record<string, unknown> {
  if (depth === 1) return { stringValue: 'leaf' };
  if (depth === 2) return { listValue: { values: [{ stringValue: 'leaf' }] } };
  return { objectValue: { fields: [
    { name: `level-${depth}`, value: canonicalObjectValueAtDepth(depth - 2) }
  ] } };
}

function containerAtDepth(depth: number): Record<string, unknown> {
  return depth === 0 ? {} : { child: containerAtDepth(depth - 1) };
}

function fact(value: Record<string, unknown>) {
  return {
    blobs: [],
    body: { fields: [{ name: 'value', value }] },
    identity: { factId: 'version-1', globalId: 'node-1', kind: 2, objectType: 'node' },
    sharedStateHash: digest(1)
  };
}

function transferProposal(overrides: Record<string, unknown>) {
  return {
    blobCount: 0, contentId: digest(2), factCount: 0, receiverDeviceId: 'receiver',
    receiverLibraryEpoch: 'receiver-epoch', senderDeviceId: 'sender',
    senderLibraryEpoch: 'sender-epoch', totalBlobBytes: 0, transferId: digest(1),
    ...overrides
  };
}

function transferTrailer(overrides: Record<string, unknown>) {
  return {
    blobCount: 0, factCount: 0, manifestHash: digest(2), transferId: digest(1),
    ...overrides
  };
}

describe('framed sync production protobuf codec exact boundaries', () => {
  it.each([
    ['list', canonicalValueAtDepth],
    ['object', canonicalObjectValueAtDepth]
  ] as const)('accepts canonical %s depth 32 and rejects depth 33', (_name, valueAtDepth) => {
    expect(() => encodeValidatedProtocolMessage(
      'fact', fact(valueAtDepth(FRAMED_SYNC_LIMITS.maxCanonicalDepth))
    )).not.toThrow();
    expect(() => encodeValidatedProtocolMessage(
      'fact', fact(valueAtDepth(FRAMED_SYNC_LIMITS.maxCanonicalDepth + 1))
    )).toThrow('canonical_depth_limit_exceeded');
  });

  it('retains an independent decoded protobuf container depth limit', () => {
    expect(() => encodeValidatedProtocolMessage('handshake', {
      capabilities: [], deviceId: 'device', groupId: 'group', libraryEpoch: 'epoch',
      protocolVersion: 22, sessionId: roundId(), unexpected: containerAtDepth(145)
    })).toThrow('protocol_depth_limit_exceeded');
  });

  it.each(['0', '9007199254740993', '18446744073709551615'])(
    'round-trips uint64 %s without precision loss',
    (unsignedValue) => {
      const encoded = encodeValidatedProtocolMessage('fact', fact({
        unsignedValue: uint64(unsignedValue)
      }));
      const decoded = decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact);
      expect(decoded.payload).toMatchObject({
        body: { fields: [{ name: 'value', value: { unsignedValue } }] }
      });
    }
  );
});

describe('framed sync production protobuf codec count boundaries', () => {
  it.each([
    ['inventory entry count', 'inventory_begin', {
      roundId: roundId(), entryCount: FRAMED_SYNC_LIMITS.maxInventoryEntries
    }, {
      roundId: roundId(), entryCount: FRAMED_SYNC_LIMITS.maxInventoryEntries + 1
    }, 'inventory_entry_limit_exceeded'],
    ['proposal fact count', 'transfer_proposal', transferProposal({
      factCount: FRAMED_SYNC_LIMITS.maxFactsPerTransfer
    }), transferProposal({
      factCount: FRAMED_SYNC_LIMITS.maxFactsPerTransfer + 1
    }), 'transfer_proposal_limit_exceeded'],
    ['proposal blob count', 'transfer_proposal', transferProposal({
      blobCount: FRAMED_SYNC_LIMITS.maxBlobsPerTransfer
    }), transferProposal({
      blobCount: FRAMED_SYNC_LIMITS.maxBlobsPerTransfer + 1
    }), 'transfer_proposal_limit_exceeded'],
    ['proposal byte count', 'transfer_proposal', transferProposal({
      totalBlobBytes: FRAMED_SYNC_LIMITS.maxTransferBytes
    }), transferProposal({
      totalBlobBytes: FRAMED_SYNC_LIMITS.maxTransferBytes + 1
    }), 'transfer_proposal_limit_exceeded'],
    ['trailer fact count', 'transfer_trailer', transferTrailer({
      factCount: FRAMED_SYNC_LIMITS.maxFactsPerTransfer
    }), transferTrailer({
      factCount: FRAMED_SYNC_LIMITS.maxFactsPerTransfer + 1
    }), 'transfer_trailer_limit_exceeded'],
    ['trailer blob count', 'transfer_trailer', transferTrailer({
      blobCount: FRAMED_SYNC_LIMITS.maxBlobsPerTransfer
    }), transferTrailer({
      blobCount: FRAMED_SYNC_LIMITS.maxBlobsPerTransfer + 1
    }), 'transfer_trailer_limit_exceeded']
  ] as const)('accepts exact %s and rejects +1', (_name, payloadCase, exact, over, error) => {
    expect(() => encodeValidatedProtocolMessage(payloadCase, exact)).not.toThrow();
    expect(() => encodeValidatedProtocolMessage(payloadCase, over)).toThrow(error);
  });
});

describe('framed sync production protobuf codec range boundaries', () => {
  it('accepts an exact blob range and rejects a one-byte overflow', () => {
    const exactOffset = FRAMED_SYNC_LIMITS.maxBlobBytes - 1;
    const exact = { blobHash: digest(2), data: Uint8Array.of(1), offset: exactOffset,
      transferId: digest(1) };
    const over = { ...exact, data: Uint8Array.of(1, 2) };
    expect(() => encodeValidatedProtocolMessage('blob_chunk', exact)).not.toThrow();
    expect(() => encodeValidatedProtocolMessage('blob_chunk', over))
      .toThrow('blob_chunk_range_invalid');
  });

  it('accepts the exact blob reference byte length and rejects +1', () => {
    const blob = { byteLength: FRAMED_SYNC_LIMITS.maxBlobBytes, required: true, role: 1,
      sha256: digest(2) };
    expect(() => encodeValidatedProtocolMessage('fact', {
      ...fact({ stringValue: 'value' }), blobs: [blob]
    })).not.toThrow();
    expect(() => encodeValidatedProtocolMessage('fact', {
      ...fact({ stringValue: 'value' }),
      blobs: [{ ...blob, byteLength: FRAMED_SYNC_LIMITS.maxBlobBytes + 1 }]
    })).toThrow('blob_byte_length_limit_exceeded');
  });

  it('accepts the exact chunk byte count and rejects +1', () => {
    const payload = { blobHash: digest(2), offset: 0, transferId: digest(1) };
    expect(() => encodeValidatedProtocolMessage('blob_chunk', {
      ...payload, data: new Uint8Array(FRAMED_SYNC_LIMITS.blobChunkBytes)
    })).not.toThrow();
    expect(() => encodeValidatedProtocolMessage('blob_chunk', {
      ...payload, data: new Uint8Array(FRAMED_SYNC_LIMITS.blobChunkBytes + 1)
    })).toThrow('blob_chunk_range_invalid');
  });
});

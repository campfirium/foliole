import { describe, expect, it } from 'vitest';

import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { bytes as decodedBytes, walk } from './framedSyncDecodedValues.js';
import {
  createFramedSyncProtocolEncoder,
  decodeAndValidateProtocolMessage,
  encodeValidatedProtocolMessage
} from './framedSyncProtocolCodec.js';

const bytes = (value: number, size = 32) => new Uint8Array(size).fill(value);
const identity = { factId: 'version-1', globalId: 'node-1', kind: 2, objectType: 'node' };

it.each(['a', 'Aé中😀'])('keeps exact UTF-8 boundaries for protocol and canonical text using %s', token => {
  const fill = (limit: number) => token.repeat(Math.floor(limit / Buffer.byteLength(token))) +
    'x'.repeat(limit % Buffer.byteLength(token));
  const protocol = fill(FRAMED_SYNC_LIMITS.maxProtocolStringBytes);
  const canonical = fill(FRAMED_SYNC_LIMITS.maxCanonicalStringBytes);
  const payload = fact({ identity: { ...identity, factId: protocol },
    body: { fields: [{ name: 'content', value: { stringValue: canonical } }] } });
  const encoded = encodeValidatedProtocolMessage('fact', payload);
  const decoded = decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact).payload;
  expect(decoded.identity).toEqual(payload.identity);
  expect(decoded.body).toEqual(payload.body);
  expect(Buffer.from(decodedBytes(decoded.sharedStateHash, 'shared_state_hash')))
    .toEqual(Buffer.from(payload.sharedStateHash));
  expect(() => encodeValidatedProtocolMessage('fact', fact({ identity: { ...identity, factId: protocol + 'x' } })))
    .toThrow('protocol_string_limit_exceeded');
  expect(() => encodeValidatedProtocolMessage('fact', fact({
    body: { fields: [{ name: 'content', value: { stringValue: canonical + 'x' } }] }
  }))).toThrow('canonical_string_limit_exceeded');
});

it('counts only own enumerable fields at the validation boundary', () => {
  const value = Object.create({ inherited: 'x'.repeat(FRAMED_SYNC_LIMITS.maxProtocolStringBytes + 1) });
  Object.defineProperty(value, 'hidden', { value: 'x'.repeat(FRAMED_SYNC_LIMITS.maxProtocolStringBytes + 1) });
  value.own = { content: 'valid' };
  const budget = { fields: 0 };
  walk(value, 0, budget);
  expect(budget.fields).toBe(2);
});

function fact(overrides: Record<string, unknown> = {}) {
  return {
    blobs: [], body: { fields: [{ name: 'title', value: { stringValue: 'Article' } }] },
    identity, sharedStateHash: bytes(1), ...overrides
  };
}

function nestedValue(depth: number): Record<string, unknown> {
  return depth === 0
    ? { stringValue: 'leaf' }
    : { listValue: { values: [nestedValue(depth - 1)] } };
}

it('preserves wire bytes across sequential payloads and independent encoders', () => {
  const left = createFramedSyncProtocolEncoder();
  const right = createFramedSyncProtocolEncoder();
  for (const size of [1_048_576, 3, 512 * 1024]) {
    const payload = { blobHash: bytes(2), data: bytes(7, size), offset: 0, transferId: bytes(1) };
    const encoded = left('blob_chunk', payload);
    right('fact', fact());
    expect(encoded).toEqual(encodeValidatedProtocolMessage('blob_chunk', payload));
    const decoded = decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.blobChunk).payload;
    expect(decoded.offset).toBe('0');
    expect(Buffer.from(decodedBytes(decoded.data, 'blob_data')).equals(Buffer.from(payload.data))).toBe(true);
  }
  expect(() => left('blob_chunk', { blobHash: bytes(2), data: bytes(7), offset: -1, transferId: bytes(1) }))
    .toThrow('blob_offset_invalid');
  expect(left('fact', fact())).toEqual(encodeValidatedProtocolMessage('fact', fact()));
});

describe('framed sync production protobuf codec', () => {
  it('round-trips a validated fact and binds the authenticated frame type', () => {
    const encoded = encodeValidatedProtocolMessage('fact', fact());
    expect(decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact).payloadCase)
      .toBe('fact');
    expect(() => decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.transferHeader))
      .toThrow('frame_payload_type_mismatch');
  });

  it('preserves valid zero-valued uint64 fields at the validation boundary', () => {
    const encoded = encodeValidatedProtocolMessage('blob_chunk', {
      blobHash: bytes(2), data: Uint8Array.of(1), offset: 0, transferId: bytes(1)
    });
    expect(decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.blobChunk).payload)
      .toMatchObject({ offset: '0' });
  });

  it('preserves empty canonical text while requiring nonempty protocol identities', () => {
    const encoded = encodeValidatedProtocolMessage('fact', fact({
      body: { fields: [{ name: 'body', value: { stringValue: '' } }] }
    }));
    expect(decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact).payload)
      .toMatchObject({ body: { fields: [{ name: 'body', value: { stringValue: '' } }] } });
    expect(() => encodeValidatedProtocolMessage('fact', fact({
      identity: { ...identity, factId: '' }
    }))).toThrow('protocol_string_required');
  });

  it.each([
    ['unspecified fact kind', fact({ identity: { ...identity, kind: 0 } }), 'fact_kind_invalid'],
    ['empty fact id', fact({ identity: { ...identity, factId: '' } }), 'protocol_string_required'],
    ['short state digest', fact({ sharedStateHash: bytes(1, 31) }), 'shared_state_hash_must_be_32_bytes'],
    ['unknown blob role', fact({ blobs: [{ byteLength: 1, required: true, role: 9,
      sha256: bytes(2) }] }), 'blob_role_invalid'],
    ['duplicate field', fact({ body: { fields: [
      { name: 'title', value: { stringValue: 'A' } },
      { name: 'title', value: { stringValue: 'B' } }
    ] } }), 'canonical_field_duplicate'],
    ['false null marker', fact({ body: { fields: [
      { name: 'empty', value: { nullValue: false } }
    ] } }), 'canonical_null_invalid']
  ])('rejects %s before encoding', (_name, payload, error) => {
    expect(() => encodeValidatedProtocolMessage('fact', payload)).toThrow(error);
  });

  it('enforces repeated and string budgets before encoding', () => {
    expect(() => encodeValidatedProtocolMessage('handshake', {
      capabilities: Array.from({ length: FRAMED_SYNC_LIMITS.maxProtocolCapabilities + 1 },
        (_, index) => ({ name: `cap-${index}`, version: 1 })),
      deviceId: 'device-a', groupId: 'group-a', libraryEpoch: 'epoch-a', protocolVersion: 22,
      sessionId: bytes(1, 16)
    })).toThrow('protocol_repeated_limit_exceeded');
    expect(() => encodeValidatedProtocolMessage('handshake', {
      capabilities: [], deviceId: 'x'.repeat(FRAMED_SYNC_LIMITS.maxProtocolStringBytes + 1),
      groupId: 'group-a', libraryEpoch: 'epoch-a', protocolVersion: 22, sessionId: bytes(1, 16)
    })).toThrow('protocol_string_limit_exceeded');
  });
});

it('preserves canonical payload text larger than the protocol identity budget', () => {
    const payload = JSON.stringify({ importedState: 'x'.repeat(170_000) });
    const encoded = encodeValidatedProtocolMessage('fact', fact({
      body: { fields: [{ name: 'payload_json', value: { stringValue: payload } }] }
    }));
    expect(decodeAndValidateProtocolMessage(encoded, FRAMED_SYNC_FRAME_TYPES.fact).payload)
      .toMatchObject({ body: { fields: [{ name: 'payload_json', value: { stringValue: payload } }] } });
    expect(() => encodeValidatedProtocolMessage('fact', fact({
      body: { fields: [{ name: 'payload_json', value: {
        stringValue: 'x'.repeat(FRAMED_SYNC_LIMITS.maxCanonicalStringBytes + 1)
      } }] }
    }))).toThrow('canonical_string_limit_exceeded');
  });

describe('framed sync production protobuf codec boundaries', () => {
  it('accepts exact boundaries and rejects depth, duplicates, Unicode, and ranges beyond them', () => {
    expect(() => encodeValidatedProtocolMessage('handshake', {
      capabilities: Array.from({ length: FRAMED_SYNC_LIMITS.maxProtocolCapabilities },
        (_, index) => ({ name: `cap-${index}`, version: 1 })),
      deviceId: 'device-a', groupId: 'group-a', libraryEpoch: 'epoch-a', protocolVersion: 22,
      sessionId: bytes(1, 16)
    })).not.toThrow();
    expect(() => encodeValidatedProtocolMessage('handshake', {
      capabilities: [{ name: 'same', version: 1 }, { name: 'same', version: 2 }],
      deviceId: 'device-a', groupId: 'group-a', libraryEpoch: 'epoch-a', protocolVersion: 22,
      sessionId: bytes(1, 16)
    })).toThrow('capability_duplicate');
    expect(() => encodeValidatedProtocolMessage('handshake', {
      capabilities: [], deviceId: '\ud800', groupId: 'group-a', libraryEpoch: 'epoch-a',
      protocolVersion: 22, sessionId: bytes(1, 16)
    })).toThrow('protocol_unicode_invalid');
    expect(() => encodeValidatedProtocolMessage('fact', fact({
      body: { fields: [{ name: 'nested', value: nestedValue(FRAMED_SYNC_LIMITS.maxCanonicalDepth + 1) }] }
    }))).toThrow('canonical_depth_limit_exceeded');
    expect(() => encodeValidatedProtocolMessage('blob_chunk', {
      blobHash: bytes(2), data: Uint8Array.of(1), offset: '18446744073709551615',
      transferId: bytes(1)
    })).toThrow('blob_chunk_range_invalid');
  });
});

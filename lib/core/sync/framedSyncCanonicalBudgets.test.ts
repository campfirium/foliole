import { expect, it } from 'vitest';

import { canonicalManifestBytes, type CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { decodeFrameHeader, encodeFrameHeader } from './framedSyncFraming.js';
import { assertFramePayloadBudget } from './framedSyncReceiver.js';

function fact(value: string, index = 0): CanonicalFact {
  return { blobs: [], body: [{ name: 'payload_json', value: { kind: 'string', value } }],
    factId: `version-${index}`, globalId: 'node-1', kind: 2, objectType: 'node',
    sharedStateHash: new Uint8Array(32).fill(7) };
}

it('bounds canonical strings by UTF-8 bytes independently of the header budget', () => {
  const limit = FRAMED_SYNC_LIMITS.maxCanonicalStringBytes;
  const value = '中'.repeat(limit / 3);
  expect(new TextEncoder().encode(value)).toHaveLength(limit);
  expect(() => canonicalManifestBytes({ facts: [fact(value)], blobs: [] })).not.toThrow();
  expect(() => canonicalManifestBytes({ facts: [fact(`${value}x`)], blobs: [] }))
    .toThrow('canonical_string_limit_exceeded');
});

it('accepts bounded multi-fact history above the wire header budget and rejects excessive cumulative bodies', () => {
  const facts = Array.from({ length: 80 }, (_, index) => fact('x'.repeat(96 * 1024), index));
  expect(canonicalManifestBytes({ facts, blobs: [] }).byteLength)
    .toBeGreaterThan(FRAMED_SYNC_LIMITS.maxManifestBytes);
  const excessive = Array.from({ length: 86 }, (_, index) => fact('x'.repeat(96 * 1024), index));
  expect(() => canonicalManifestBytes({ facts: excessive, blobs: [] }))
    .toThrow('canonical_manifest_limit_exceeded');
});

it('keeps header and decoded fact limits while allowing the complete authenticated frame', () => {
  expect(() => assertFramePayloadBudget(FRAMED_SYNC_FRAME_TYPES.transferHeader, 768 * 1024 + 1))
    .toThrow('frame_payload_limit_exceeded');
  expect(() => assertFramePayloadBudget(FRAMED_SYNC_FRAME_TYPES.fact, 2 * 1024 * 1024 + 1))
    .toThrow('frame_payload_limit_exceeded');
  const ciphertextBytes = 2 * 1024 * 1024 + 16;
  const header = encodeFrameHeader({ ciphertextBytes, flags: 0,
    frameType: FRAMED_SYNC_FRAME_TYPES.fact, sequence: 0n });
  expect(decodeFrameHeader(header).ciphertextBytes).toBe(ciphertextBytes);
  expect(() => encodeFrameHeader({ ciphertextBytes: ciphertextBytes + 1, flags: 0,
    frameType: FRAMED_SYNC_FRAME_TYPES.fact, sequence: 0n })).toThrow('wire_frame_limit_exceeded');
});

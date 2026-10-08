import { expect, it } from 'vitest';

import type { CanonicalFact } from './framedSyncCanonicalManifest.js';
import { FramedSyncFactFragmentProgress } from './framedSyncFactFragmentProgress.js';
import { FramedSyncFactFragmentDecoder } from './framedSyncFactFrameReader.js';
import { iterateFramedSyncFactPayloads } from './framedSyncFactPayloads.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import { canonicalFactFromValidatedMessage } from './framedSyncWireFact.js';
import { wireUint64 } from './framedSyncWireProjection.js';

function fact(large: boolean): CanonicalFact {
  return { blobs: [], factId: 'version', globalId: 'node', kind: 2, objectType: 'node',
    sharedStateHash: new Uint8Array(32).fill(7), body: ['first', 'second'].map(name => ({ name,
      value: { kind: 'string', value: large ? name[0]!.repeat(1_200_000) : '\ufeff中😀\0tail' } })) };
}

function messages() {
  return [...iterateFramedSyncFactPayloads(fact(true))].map(value => {
    const encoded = encodeValidatedProtocolMessage(value.payloadCase, value.payload);
    expect(encoded.byteLength).toBeLessThan(2 * 1024 * 1024);
    return decodeAndValidateProtocolMessage(encoded, 3);
  });
}

function fragment(payload: Readonly<Record<string, unknown>>) {
  return decodeAndValidateProtocolMessage(encodeValidatedProtocolMessage('fact_fragment', {
    ...payload, totalByteLength: wireUint64(BigInt(String(payload.totalByteLength))),
    offset: wireUint64(BigInt(String(payload.offset)))
  }), 3);
}

it('keeps small facts whole and reconstructs one large fact with unchanged identity and content', () => {
  const small = [...iterateFramedSyncFactPayloads(fact(false))];
  expect(small).toHaveLength(1);
  expect(small[0]!.payloadCase).toBe('fact');
  const decoder = new FramedSyncFactFragmentDecoder();
  const parts = messages();
  let complete: ReturnType<typeof decoder.accept> = null;
  parts.forEach((message, index) => { complete = decoder.accept(message, BigInt(index + 1)); });
  expect(complete).not.toBeNull();
  expect(canonicalFactFromValidatedMessage(complete!.message)).toEqual(fact(true));
  expect(complete!.lastSequence).toBe(BigInt(parts.length));
});

it('rejects missing, reordered, interrupted and inconsistent fragments', () => {
  const parts = messages();
  const progress = new FramedSyncFactFragmentProgress();
  expect(progress.accept(parts[0]!, 1n)).toBeNull();
  expect(() => progress.assertComplete()).toThrow('fact_fragment_incomplete');
  expect(() => progress.accept(parts[2]!, 3n)).toThrow('fact_fragment_not_contiguous');
  const changed = fragment({
    ...parts[1]!.payload, offset: wireUint64(0n)
  });
  expect(() => progress.accept(changed, 2n)).toThrow('fact_fragment_not_contiguous');
});

it('rejects modified encoded content and a declared identity differing from the completed fact', () => {
  const parts = messages();
  const damaged = new FramedSyncFactFragmentDecoder();
  expect(() => parts.forEach((part, index) => {
    const data = new Uint8Array(part.payload.data as Uint8Array);
    if (index === 0) data[100] = data[100]! ^ 1;
    damaged.accept(fragment({
      ...part.payload, data
    }), BigInt(index + 1));
  })).toThrow('fact_fragment_digest_mismatch');
  const identity = new FramedSyncFactFragmentDecoder();
  expect(() => parts.forEach((part, index) => identity.accept(
    fragment({
      ...part.payload, identity: { ...(part.payload.identity as Record<string, unknown>), factId: 'changed' }
    }), BigInt(index + 1)))).toThrow('fact_fragment_identity_mismatch');
});

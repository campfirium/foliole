import { describe, expect, it } from 'vitest';

import { sameCanonicalManifest } from './framedSyncCanonicalEquality.js';
import { canonicalContentId, canonicalManifestBytes, type CanonicalManifest, type CanonicalValue } from './framedSyncCanonicalManifest.js';
import { CanonicalWriter } from './framedSyncCanonicalWriter.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

function manifest(value: CanonicalValue): CanonicalManifest {
  const blobs = [1, 2].map((byte) => ({ sha256: new Uint8Array(32).fill(byte), byteLength: BigInt(byte), role: 1, required: true }));
  return { blobs, facts: [1, 2].map((index) => ({
    kind: 2, objectType: 'node', globalId: `node-${index}`, factId: 'version', sharedStateHash: new Uint8Array(32).fill(index),
    blobs, body: [{ name: 'value', value }, { name: 'other', value: { kind: 'null' } }]
  })) };
}

describe('canonical publication equality', () => {
  it.each<CanonicalValue>([
    { kind: 'null' }, { kind: 'bool', value: false }, { kind: 'bytes', value: Uint8Array.of(0, 255) },
    { kind: 'signed', value: -10n }, { kind: 'unsigned', value: 10n }, { kind: 'string', value: '中😀' },
    { kind: 'list', value: [{ kind: 'null' }, { kind: 'string', value: 'A' }] },
    { kind: 'object', value: [{ name: 'b', value: { kind: 'bool', value: false } },
      { name: 'a', value: { kind: 'bytes', value: Uint8Array.of(1) } }] }
  ])('matches canonical bytes after reordering sets but preserves typed values', async (value) => {
    const left = manifest(value);
    const right = { blobs: [...left.blobs].reverse(), facts: [...left.facts].reverse().map((fact) => ({
      ...fact, blobs: [...fact.blobs].reverse(), body: [...fact.body].reverse()
    })) };
    await canonicalContentId(left);
    await canonicalContentId(right);
    expect(sameCanonicalManifest(left, right)).toBe(true);
    expect(canonicalManifestBytes(left)).toEqual(canonicalManifestBytes(right));
    const changed = manifest({ kind: 'string', value: 'different' });
    await canonicalContentId(changed);
    expect(sameCanonicalManifest(left, changed)).toBe(false);
    expect(canonicalManifestBytes(left)).not.toEqual(canonicalManifestBytes(changed));
  });

  it('compares identity, blob lengths, flags, roles and ordered list values exactly', async () => {
    const left = manifest({ kind: 'list', value: [{ kind: 'string', value: 'A' }, { kind: 'string', value: 'B' }] });
    const changes = [
      manifest({ kind: 'list', value: [{ kind: 'string', value: 'B' }, { kind: 'string', value: 'A' }] }),
      { ...left, facts: left.facts.map((fact) => ({ ...fact, factId: 'different' })) },
      ...[{ byteLength: 3n }, { required: false }, { role: 5 }].map((patch) => {
        const blobs = left.blobs.map((blob) => ({ ...blob, ...patch }));
        return { blobs, facts: left.facts.map((fact) => ({ ...fact, blobs })) };
      })
    ];
    for (const right of changes) {
      await canonicalContentId(right);
      expect(sameCanonicalManifest(left, right)).toBe(false);
      expect(canonicalManifestBytes(left)).not.toEqual(canonicalManifestBytes(right));
    }
  });
});

it('encodes canonical strings in bounded pieces without changing bytes or scalar validation', () => {
  const text = 'x'.repeat(16 * 1024 - 1) + '😀' + '中'.repeat(300000);
  let largest = 0;
  const chunks: Uint8Array[] = [];
  new CanonicalWriter((bytes) => { largest = Math.max(largest, bytes.byteLength); chunks.push(bytes); }).string(text);
  const expected = new CanonicalWriter();
  expected.data(new TextEncoder().encode(text));
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(expected.result()));
  expect(largest).toBeLessThanOrEqual(64 * 1024);
  for (const invalid of ['\ud800', '\udc00', 'x'.repeat(16 * 1024 - 1) + '\ud800x']) {
    expect(() => new CanonicalWriter().string(invalid)).toThrow('canonical_unicode_invalid');
  }
  expect(() => new CanonicalWriter().string('x'.repeat(FRAMED_SYNC_LIMITS.maxCanonicalStringBytes + 1)))
    .toThrow('canonical_string_limit_exceeded');
});

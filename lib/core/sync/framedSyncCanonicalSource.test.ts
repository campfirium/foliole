import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { canonicalContentId, canonicalContentIdFromSource, canonicalManifestBytes,
  type CanonicalBlob, type CanonicalFact, type CanonicalField, type CanonicalManifest } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

const digest = (byte: number) => new Uint8Array(32).fill(byte);
const blob = (byte: number): CanonicalBlob => ({ sha256: digest(byte), byteLength: BigInt(byte), role: 1, required: true });

function fact(id: string, body: readonly CanonicalField[] = [], blobs: readonly CanonicalBlob[] = []): CanonicalFact {
  return { factId: id, globalId: 'node', kind: 2, objectType: 'node', sharedStateHash: digest(4), body, blobs };
}

function entries(facts: readonly CanonicalFact[]) {
  return facts.map((value, locator) => {
    const descriptor = { blobs: value.blobs, factId: value.factId, globalId: value.globalId,
      kind: value.kind, objectType: value.objectType, sharedStateHash: value.sharedStateHash };
    return { descriptor, locator };
  });
}

function source(manifest: CanonicalManifest) {
  return canonicalContentIdFromSource(entries(manifest.facts), manifest.blobs, async (locator) => manifest.facts[locator]!);
}

async function assertSame(manifest: CanonicalManifest) {
  const expected = sha256(canonicalManifestBytes(manifest));
  expect(await canonicalContentId(manifest)).toEqual(expected);
  expect(await source(manifest)).toEqual(expected);
}

it('matches canonical bytes for empty input and out-of-order Unicode facts, fields and blob references', async () => {
  await assertSame({ facts: [], blobs: [] });
  const blobs = [blob(3), blob(1), blob(2)];
  const body: CanonicalField[] = [
    { name: '😀', value: { kind: 'string', value: '\ufeff中😀\0' } },
    { name: '\ue000', value: { kind: 'bytes', value: Uint8Array.of(0, 255, 128) } },
    { name: 'Z', value: { kind: 'object', value: [
      { name: 'b', value: { kind: 'signed', value: -1n } },
      { name: 'a', value: { kind: 'list', value: [{ kind: 'bool', value: true }, { kind: 'null' }] } }
    ] } }
  ];
  const facts = [fact('😀', body, blobs), fact('\ue000', [...body].reverse(), [...blobs].reverse()), fact('A')];
  await assertSame({ facts, blobs });
  expect(await source({ facts: [...facts].reverse(), blobs: [...blobs].reverse() }))
    .toEqual(await canonicalContentId({ facts, blobs }));
});

it('loads one fact at a time in canonical kind and UTF-8 identity order regardless of arrival', async () => {
  const facts = [fact('😀'), fact('\ue000'), fact('A'), { ...fact('last-arrival'), kind: 1 }];
  const loaded: string[] = [];
  let active = 0, peak = 0;
  const actual = await canonicalContentIdFromSource(entries(facts), [], async (locator) => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    const value = facts[locator]!;
    loaded.push(value.factId);
    active -= 1;
    return value;
  });
  expect(loaded).toEqual(['last-arrival', 'A', '\ue000', '😀']);
  expect(peak).toBe(1);
  expect(actual).toEqual(sha256(canonicalManifestBytes({ facts, blobs: [] })));
});

it('matches a legal maximum UTF-8 string and rejects the next byte', async () => {
  const value = '😀'.repeat(FRAMED_SYNC_LIMITS.maxCanonicalStringBytes / 4);
  const legal = fact('large', [{ name: 'value', value: { kind: 'string', value } }]);
  await assertSame({ facts: [legal], blobs: [] });
  const excessive = { facts: [fact('large', [{ name: 'value', value: { kind: 'string', value: `${value}x` } }])], blobs: [] };
  expect(() => canonicalManifestBytes(excessive)).toThrow('canonical_string_limit_exceeded');
  await expect(source(excessive)).rejects.toThrow('canonical_string_limit_exceeded');
});

it('rejects duplicate facts and invalid manifest graphs before loading source bodies', async () => {
  const a = blob(1), b = blob(2), node = fact('one', [], [a]);
  const cases: Array<{ manifest: CanonicalManifest; error: string }> = [
    { manifest: { facts: [node, node], blobs: [a] }, error: 'canonical_fact_duplicate' },
    { manifest: { facts: [node], blobs: [a, b] }, error: 'canonical_blob_unreferenced' },
    { manifest: { facts: [node], blobs: [b] }, error: 'canonical_fact_blob_undeclared' },
    { manifest: { facts: [node], blobs: [{ ...a, byteLength: 2n }] }, error: 'canonical_blob_descriptor_mismatch' }
  ];
  for (const { manifest, error } of cases) {
    expect(() => canonicalManifestBytes(manifest)).toThrow(error);
    let calls = 0;
    await expect(canonicalContentIdFromSource(entries(manifest.facts), manifest.blobs, async (locator) => {
      calls += 1;
      return manifest.facts[locator]!;
    })).rejects.toThrow(error);
    expect(calls).toBe(0);
  }
});

it('enforces the complete graph edge budget across facts at its boundary', async () => {
  const blobs = [blob(1), blob(2)];
  const facts = Array.from({ length: FRAMED_SYNC_LIMITS.maxFactBlobEdges / 2 }, (_, index) => fact(`v-${index}`, [], blobs));
  await assertSame({ facts, blobs });
  const excessive = { facts: [...facts, fact('overflow', [], [blobs[0]!])], blobs };
  expect(() => canonicalManifestBytes(excessive)).toThrow('canonical_fact_blob_edge_limit_exceeded');
  await expect(source(excessive)).rejects.toThrow('canonical_fact_blob_edge_limit_exceeded');
});

it('rejects a loaded fact whose identity, state digest or blob descriptor changed', async () => {
  const original = fact('one', [], [blob(1)]);
  const mutations: CanonicalFact[] = [
    { ...original, kind: 1 }, { ...original, objectType: 'review' }, { ...original, globalId: 'other' },
    { ...original, factId: 'other' }, { ...original, sharedStateHash: digest(9) },
    { ...original, blobs: [] }, { ...original, blobs: [{ ...blob(1), byteLength: 2n }] },
    { ...original, blobs: [{ ...blob(1), role: 5 }] },
    { ...original, blobs: [{ ...blob(1), required: false }] }, { ...original, blobs: [blob(2)] }
  ];
  for (const changed of mutations) await expect(canonicalContentIdFromSource(entries([original]), original.blobs,
    async () => changed)).rejects.toThrow('canonical_fact_source_changed');
});

it('keeps the field budget cumulative across loaded facts instead of resetting it per fact', async () => {
  const body: CanonicalField[] = Array.from({ length: FRAMED_SYNC_LIMITS.maxCanonicalFields / 2 }, (_, index) =>
    ({ name: `field-${index}`, value: { kind: 'null' } }));
  const facts = [fact('one', body), fact('two', body)];
  await assertSame({ facts, blobs: [] });
  const excessive = { facts: [...facts, fact('three', [{ name: 'extra', value: { kind: 'null' } }])], blobs: [] };
  expect(() => canonicalManifestBytes(excessive)).toThrow('canonical_node_limit_exceeded');
  await expect(source(excessive)).rejects.toThrow('canonical_node_limit_exceeded');
});

it('keeps total canonical byte limits cumulative across individually legal facts', async () => {
  const body: CanonicalField[] = [{ name: 'value', value: { kind: 'string', value: 'x'.repeat(96 * 1024) } }];
  const facts = Array.from({ length: 80 }, (_, index) => fact(`v-${index}`, body));
  await assertSame({ facts, blobs: [] });
  const excessive = { facts: Array.from({ length: 86 }, (_, index) => fact(`v-${index}`, body)), blobs: [] };
  expect(() => canonicalManifestBytes(excessive)).toThrow('canonical_manifest_limit_exceeded');
  await expect(source(excessive)).rejects.toThrow('canonical_manifest_limit_exceeded');
});

it('propagates a loader failure unchanged and stops before requesting later facts', async () => {
  const facts = [fact('c'), fact('b'), fact('a')], failure = new Error('source_disk_failure');
  const loaded: string[] = [];
  await expect(canonicalContentIdFromSource(entries(facts), [], async (locator) => {
    const value = facts[locator]!;
    loaded.push(value.factId);
    if (value.factId === 'b') throw failure;
    return value;
  })).rejects.toBe(failure);
  expect(loaded).toEqual(['a', 'b']);
});

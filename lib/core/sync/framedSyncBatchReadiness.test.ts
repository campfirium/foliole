import { expect, it } from 'vitest';

import { isFramedSyncPublicationBatchReady } from './framedSyncBatchReadiness.js';
import type { CanonicalFact, CanonicalField, CanonicalValue } from './framedSyncCanonicalManifest.js';

const string = (value: string): CanonicalValue => ({ kind: 'string', value });
const nil: CanonicalValue = { kind: 'null' };
const list = (values: readonly string[]): CanonicalValue => ({ kind: 'list', value: values.map(string) });

function root(factId: string, parents: readonly string[] = []): CanonicalFact {
  return { blobs: [{ byteLength: 4n, required: true, role: 1, sha256: new Uint8Array(32) }],
    body: [
      { name: 'snapshot', value: { kind: 'object', value: [
        { name: 'parent_id', value: nil }, { name: 'position', value: nil }
      ] } },
      { name: 'parent_version_id', value: parents[0] ? string(parents[0]) : nil },
      { name: 'parent_version_ids', value: list(parents) },
      { name: 'ancestor_version_ids', value: list(parents) }
    ], factId, globalId: 'root', kind: 2, objectType: 'node', sharedStateHash: new Uint8Array(32) };
}
const ready = (...facts: readonly CanonicalFact[]) => isFramedSyncPublicationBatchReady({ manifest: { blobs: [], facts } });
function field(fact: CanonicalFact, name: string, value: CanonicalValue): CanonicalFact {
  return { ...fact, body: fact.body.map(item => item.name === name ? { name, value } : item) };
}
function snapshot(fact: CanonicalFact, fields: readonly CanonicalField[]): CanonicalFact {
  return field(fact, 'snapshot', { kind: 'object', value: fields });
}

it('qualifies settings and a complete root version closure', () => {
  const base = root('version-0');
  const next = root('version-1', ['version-0']);
  expect(ready(base, next)).toBe(true);
  expect(ready({ ...base, kind: 1, objectType: 'setting' })).toBe(true);
  expect(ready()).toBe(false);
});

it('allows original parented, positioned and delta nodes without requiring already-held versions in the same unit', () => {
  const base = root('version-0');
  expect(ready(snapshot(base, [{ name: 'parent_id', value: string('missing-parent') }, { name: 'position', value: nil }]))).toBe(true);
  expect(ready(snapshot(base, [{ name: 'parent_id', value: nil }, { name: 'position', value: { kind: 'signed', value: 0n } }]))).toBe(true);
  expect(ready(root('version-1', ['not-in-this-unit']))).toBe(true);
  expect(ready(field(base, 'ancestor_version_ids', list(['remote-only-ancestor'])))).toBe(true);
  expect(ready(field(base, 'parent_version_id', string('remote-only-parent')))).toBe(true);
});

it('packs identity-only, reading, relation, review and state units while keeping their original boundaries', () => {
  const base = root('version-0');
  const retired = { ...base, blobs: [], body: [...base.body, { name: 'body_retired', value: { kind: 'bool', value: true } } satisfies CanonicalField] };
  expect(ready(retired)).toBe(true);
  expect(ready(retired, root('version-1', ['version-0']))).toBe(true);
  expect(ready({ ...base, blobs: [] })).toBe(true);
  for (const extra of [
    { ...base, kind: 1, factId: 'node_reading:hash' }, { ...base, kind: 3 }, { ...base, kind: 4 }
  ]) expect(ready(base, extra)).toBe(true);
  for (const objectType of ['node_position', 'parent_order_position', 'order_version', 'parent_child_order']) {
    expect(ready({ ...base, kind: 1, objectType })).toBe(true);
  }
});

it('excludes attachment facts, unsupported kinds and mixed original object identities', () => {
  const base = root('version-0');
  expect(ready({ ...base, kind: 7 })).toBe(false);
  expect(ready({ ...base, kind: 0 })).toBe(false);
  expect(ready(base, { ...base, kind: 1, objectType: 'setting' })).toBe(false);
  expect(ready(base, { ...base, factId: 'other-version', globalId: 'other-node' })).toBe(false);
});

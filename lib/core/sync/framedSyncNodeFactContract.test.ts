import { expect, it } from 'vitest';

import type { CanonicalFact, CanonicalField } from './framedSyncCanonicalManifest.js';
import {
  assertNodeVersionFactShape,
  FRAMED_SYNC_NODE_VERSION_FACT
} from './framedSyncNodeFactContract.js';

const digest = (value: number) => new Uint8Array(32).fill(value);
const string = (value: string) => ({ kind: 'string' as const, value });
const nullableString = (value: string | null) => value === null
  ? { kind: 'null' as const }
  : string(value);

function snapshot(bodyHash: string): CanonicalField[] {
  const values: Record<string, CanonicalField['value']> = {
    anchor_link: nullableString(null),
    anchor_resolution_status: nullableString('resolved'),
    anchor_source_version_id: nullableString(null),
    attachments: { kind: 'list', value: [{ kind: 'object', value: [
      { name: 'attachment_id', value: string('attachment-1') },
      { name: 'role', value: string('image') }
    ] }] },
    body_blob_hash: string(bodyHash),
    text_alternatives: nullableString(null),
    text_selection: nullableString(null),
    created_at: string('2026-10-05T00:00:00.000Z'),
    deleted_at: nullableString(null),
    desired_retention: { kind: 'signed', value: 3n },
    enable_short_term: { kind: 'bool', value: true },
    hide_title_heading: { kind: 'bool', value: false },
    id: string('node-1'),
    image_regions: nullableString(null),
    image_sources: nullableString(null),
    import_content_fingerprint: nullableString(null),
    import_source_fingerprint: nullableString(null),
    is_title_manual: { kind: 'bool', value: true },
    kind: string('article'),
    manual_child_order: nullableString(null),
    opening_text: nullableString('Opening'),
    parent_id: nullableString(null),
    position: { kind: 'signed', value: 1n },
    priority: { kind: 'null' },
    resource_references: nullableString(null),
    reveal: nullableString(null),
    sequential_reading_enabled: { kind: 'bool', value: false },
    shelved_at: nullableString(null),
    title: string('Title'),
    updated_at: string('2026-10-05T00:00:00.000Z'),
    virtual_filter: nullableString(null)
  };
  return FRAMED_SYNC_NODE_VERSION_FACT.snapshotFields.map((name) => ({ name, value: values[name]! }));
}

function fact(): CanonicalFact {
  const stateHash = digest(1);
  const blobHash = digest(2);
  const bodyValues: Record<string, CanonicalField['value']> = {
    ancestor_version_ids: { kind: 'list', value: [string('version-0')] },
    content_hash: string('01'.repeat(32)),
    host_name: nullableString(null),
    is_tombstone: { kind: 'bool', value: false },
    parent_version_id: nullableString('version-0'),
    parent_version_ids: { kind: 'list', value: [string('version-0')] },
    snapshot: { kind: 'object', value: snapshot('02'.repeat(32)) },
    updated_at: string('2026-10-05T00:00:00.000Z'),
    version_created_at: nullableString(null)
  };
  return {
    blobs: [{ byteLength: 4n, required: true, role: 1, sha256: blobHash }],
    body: FRAMED_SYNC_NODE_VERSION_FACT.bodyFields.map((name) => ({ name, value: bodyValues[name]! })),
    factId: 'version-1', globalId: 'node-1', kind: 2, objectType: 'node',
    sharedStateHash: stateHash
  };
}

function replaceBodyField(value: CanonicalFact, name: string, fieldValue: CanonicalField['value']) {
  return { ...value, body: value.body.map((field) => field.name === name
    ? { name, value: fieldValue }
    : field) };
}

it('accepts the exact reversible node-version shape', () => {
  expect(() => assertNodeVersionFactShape(fact())).not.toThrow();
});

it('keeps attachment references in a database fact without requiring attachment bytes', () => {
  const value = fact();
  const snapshotValue = value.body.find((field) => field.name === 'snapshot')!.value;
  if (snapshotValue.kind !== 'object') throw new Error('test_snapshot_required');
  const references = JSON.stringify([
    { original_name: 'Cover.png', role: 'image', storage_key: `${'3'.repeat(64)}.png` },
    { original_name: 'Document.pdf', role: 'reference', storage_key: `${'4'.repeat(64)}.pdf` }
  ]);
  const databaseFact = replaceBodyField(value, 'snapshot', {
    kind: 'object', value: snapshotValue.value.map((field) => field.name === 'resource_references'
      ? { ...field, value: string(references) } : field)
  });
  expect(databaseFact.blobs.map((blob) => blob.role)).toEqual([1]);
  expect(() => assertNodeVersionFactShape(databaseFact)).not.toThrow();
});

it('rejects incomplete, nullable, or mistyped top-level fields', () => {
  expect(() => assertNodeVersionFactShape({ ...fact(), body: fact().body.slice(1) }))
    .toThrow('node_version_fact_body_shape_invalid');
  expect(() => assertNodeVersionFactShape(replaceBodyField(fact(), 'is_tombstone', { kind: 'null' })))
    .toThrow('node_version_fact_bool_invalid');
  expect(() => assertNodeVersionFactShape(replaceBodyField(fact(), 'ancestor_version_ids', string('v'))))
    .toThrow('node_version_fact_string_list_invalid');
});

it('requires the exact typed snapshot and matching node identity', () => {
  expect(() => assertNodeVersionFactShape(replaceBodyField(fact(), 'snapshot', { kind: 'null' })))
    .toThrow('node_version_fact_snapshot_invalid');
  const value = fact();
  const snapshotValue = value.body.find((field) => field.name === 'snapshot')!.value;
  if (snapshotValue.kind !== 'object') throw new Error('test_snapshot_required');
  expect(() => assertNodeVersionFactShape(replaceBodyField(value, 'snapshot', {
    kind: 'object', value: snapshotValue.value.slice(1)
  }))).toThrow('node_version_fact_snapshot_shape_invalid');
  expect(() => assertNodeVersionFactShape(replaceBodyField(value, 'snapshot', {
    kind: 'object', value: snapshotValue.value.map((field) => field.name === 'id'
      ? { ...field, value: string('node-2') }
      : field)
  }))).toThrow('node_version_fact_snapshot_identity_invalid');
});

it('requires one required NODE_BODY blob matching snapshot.body_blob_hash', () => {
  expect(() => assertNodeVersionFactShape({ ...fact(), blobs: [] }))
    .toThrow('node_version_fact_body_blob_invalid');
  expect(() => assertNodeVersionFactShape({ ...fact(), blobs: [
    ...fact().blobs, { ...fact().blobs[0]!, sha256: digest(3) }
  ] })).toThrow('node_version_fact_body_blob_invalid');
  const value = fact();
  const snapshotValue = value.body.find((field) => field.name === 'snapshot')!.value;
  if (snapshotValue.kind !== 'object') throw new Error('test_snapshot_required');
  expect(() => assertNodeVersionFactShape(replaceBodyField(value, 'snapshot', {
    kind: 'object', value: snapshotValue.value.map((field) => field.name === 'body_blob_hash'
      ? { ...field, value: string('03'.repeat(32)) }
      : field)
  }))).toThrow('node_version_fact_body_blob_hash_mismatch');
});

it('rejects an external document body attached to an unrelated node fact', () => {
  const value = fact();
  expect(() => assertNodeVersionFactShape({ ...value, blobs: [
    ...value.blobs, { byteLength: 4n, required: true, role: 5, sha256: digest(3) }
  ] })).toThrow('node_version_fact_resource_blobs_invalid');
});

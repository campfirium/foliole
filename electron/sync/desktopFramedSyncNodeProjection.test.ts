import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';

import {
  canonicalManifestBytes,
  type CanonicalValue
} from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { assertNodeVersionFactShape } from '../../lib/core/sync/framedSyncNodeFactContract.js';
import { projectFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeProjection.js';
import { restoreFramedSyncNodeIdentityFact } from '../../lib/core/sync/framedSyncNodeRestore.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import {
  projectDesktopFramedSyncNodeRecord,
  restoreDesktopFramedSyncNodeRecord
} from './desktopFramedSyncNodeProjection.js';

function record(overrides: Partial<NativeSyncNodeRecord> = {}): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['version-root', 'version-parent'],
    body_text: 'Body with Unicode: 叶',
    content_hash: '1'.repeat(64),
    host_name: 'Mac Studio',
    is_tombstone: false,
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'version-parent',
    parent_version_ids: ['version-parent', 'version-merge'],
    snapshot: {
      anchor_link: 'anchor-1',
      anchor_resolution_status: 'resolved',
      anchor_source_version_id: 'version-root',
      attachments: [
        { attachment_id: 'image-hash', role: 'image' },
        { attachment_id: 'pdf-hash', role: 'document' }
      ],
      body_blob_hash: null,
      created_at: '2026-10-05T01:00:00.000Z',
      deleted_at: null,
      desired_retention: 7,
      enable_short_term: true,
      hide_title_heading: false,
      id: 'node-1',
      image_regions: '[{"id":"region-1"}]',
      image_sources: '["image-hash"]',
      import_content_fingerprint: 'content-fingerprint',
      import_source_fingerprint: 'source-fingerprint',
      is_title_manual: true,
      kind: 'article',
      manual_child_order: '["child-1"]',
      opening_text: 'Opening',
      parent_id: 'folder-1',
      position: 4,
      priority: 2,
      resource_references: '[]',
      reveal: 'answer',
      sequential_reading_enabled: false,
      shelved_at: '2026-10-05T02:00:00.000Z',
      title: 'Projected article',
      updated_at: '2026-10-05T03:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-10-05T03:00:00.000Z',
    version_created_at: '2026-10-05T01:00:00.000Z',
    version_id: 'version-1',
    ...overrides
  };
}

function objectFields(value: CanonicalValue) {
  if (value.kind !== 'object') throw new Error('expected_object');
  return Object.fromEntries(value.value.map((entry) => [entry.name, entry.value]));
}

function containsString(value: CanonicalValue, expected: string): boolean {
  if (value.kind === 'string') return value.value === expected;
  if (value.kind === 'list') return value.value.some((entry) => containsString(entry, expected));
  if (value.kind === 'object') return value.value.some((entry) => containsString(entry.value, expected));
  return false;
}

function expectRoundTripProjection(
  source: NativeSyncNodeRecord,
  projection: ReturnType<typeof projectDesktopFramedSyncNodeRecord>
) {
  const [fact] = projection.manifest.facts;
  if (!fact) throw new Error('fact_missing');

  const body = Object.fromEntries(fact.body.map((entry) => [entry.name, entry.value]));
  const snapshotValue = body.snapshot;
  if (!snapshotValue) throw new Error('snapshot_missing');
  const snapshot = objectFields(snapshotValue);
  expect(snapshot).not.toHaveProperty('content');
  expect(fact.body.some((entry) => containsString(entry.value, 'Body with Unicode: 叶'))).toBe(false);
  expect(snapshot.attachments).toEqual({ kind: 'list', value: [
    { kind: 'object', value: [
      { name: 'attachment_id', value: { kind: 'string', value: 'image-hash' } },
      { name: 'role', value: { kind: 'string', value: 'image' } }
    ] },
    { kind: 'object', value: [
      { name: 'attachment_id', value: { kind: 'string', value: 'pdf-hash' } },
      { name: 'role', value: { kind: 'string', value: 'document' } }
    ] }
  ] });
  expect(body.parent_version_ids).toEqual({ kind: 'list', value: [
    { kind: 'string', value: 'version-parent' },
    { kind: 'string', value: 'version-merge' }
  ] });
  expect(body.ancestor_version_ids).toEqual({ kind: 'list', value: [
    { kind: 'string', value: 'version-root' }, { kind: 'string', value: 'version-parent' }
  ] });

  const [blob] = projection.manifest.blobs;
  if (!blob) throw new Error('blob_missing');
  expect(blob).toMatchObject({ byteLength: BigInt(projection.bodyBlob.byteLength), required: true, role: 1 });
  expect(snapshot.body_blob_hash).toEqual({ kind: 'string', value: bytesToHex(blob.sha256) });
  expect(fact.blobs).toEqual([blob]);
  expect(() => canonicalManifestBytes(projection.manifest)).not.toThrow();
  expect(restoreDesktopFramedSyncNodeRecord(projection)).toEqual({
    ...source,
    snapshot: { ...source.snapshot, body_blob_hash: bytesToHex(blob.sha256) }
  });
}

describe('desktop framed sync node projection', () => {
  it('round-trips version parents, snapshot fields, and attachment references', () => {
    const source = record();
    expectRoundTripProjection(source, projectDesktopFramedSyncNodeRecord(source));
  });

  it('represents a tombstone with a required empty body blob', () => {
    const source = record({
      body_text: null,
      is_tombstone: true,
      snapshot: { ...record().snapshot, deleted_at: '2026-10-05T04:00:00.000Z' }
    });
    const projection = projectDesktopFramedSyncNodeRecord(source);
    expect(projection.bodyBlob).toHaveLength(0);
    expect(projection.manifest.blobs).toEqual([{
      byteLength: 0n,
      required: true,
      role: 1,
      sha256: expect.any(Uint8Array)
    }]);
    expect(restoreDesktopFramedSyncNodeRecord(projection)).toMatchObject({
      body_text: '',
      is_tombstone: true,
      snapshot: { deleted_at: '2026-10-05T04:00:00.000Z' }
    });
  });

  it('rejects a body whose bytes no longer match the frozen manifest', () => {
    const projection = projectDesktopFramedSyncNodeRecord(record());
    expect(() => restoreDesktopFramedSyncNodeRecord({
      ...projection,
      bodyBlob: new TextEncoder().encode('changed body')
    })).toThrow('node_version_projection_body_blob_invalid');
  });
});

it('declares retired history explicitly without inventing body or resource blobs', () => {
  const source = record({ body_text: null, snapshot: { ...record().snapshot, content: null,
    body_blob_hash: 'a'.repeat(64), resource_references: JSON.stringify([
      { storage_key: `${'b'.repeat(64)}.pdf`, role: 'reference', original_name: 'Old.pdf' }
    ]) } });
  const fact = projectFramedSyncNodeIdentityFact(source);
  expect(fact.blobs).toEqual([]);
  expect(restoreFramedSyncNodeIdentityFact(fact)).toMatchObject(source);
  expect(() => projectDesktopFramedSyncNodeRecord(source)).toThrow('node_version_body_unavailable');
  expect(() => assertNodeVersionFactShape({ ...fact,
    body: fact.body.filter((field) => field.name !== 'body_retired') }))
    .toThrow('node_version_fact_body_blob_invalid');
  const full = projectDesktopFramedSyncNodeRecord(record()).manifest.facts[0]!;
  expect(() => assertNodeVersionFactShape({ ...full, body: [...full.body,
    { name: 'body_retired', value: { kind: 'bool', value: true } }] }))
    .toThrow('node_version_fact_body_blob_invalid');
});

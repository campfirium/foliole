// @vitest-environment node

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import type { DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalBlob } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';

import { decodeCompanionFramedSyncTransfer } from './companionFramedSyncDecode.js';

const resourceBytes = new TextEncoder().encode('%PDF-1.7\nresource');
const resourceHash = sha256(resourceBytes);
const storageKey = `${bytesToHex(resourceHash)}.pdf`;
const resourceBlob: CanonicalBlob = {
  byteLength: BigInt(resourceBytes.byteLength), required: true, role: 3, sha256: resourceHash
};

it('accepts a Node resource only when its descriptor, native pin, and published key agree', () => {
  const record = nodeRecord();
  record.snapshot.resource_references = JSON.stringify([
    { original_name: 'Paper.pdf', role: 'reference', storage_key: storageKey }
  ]);
  const projected = projectFramedSyncNodeRecord(record, [resourceBlob]);
  const body = projected.manifest.blobs[0]!;
  const input = {
    bodyRows: [row(body, { data: projected.bodyBlob })],
    facts: [...projected.manifest.facts],
    resourceRows: [row(resourceBlob, { storage_key: storageKey })],
    resourceStorageKeys: [storageKey]
  };

  expect(decodeCompanionFramedSyncTransfer(input).nodes[0]?.snapshot.resource_references)
    .toBe(record.snapshot.resource_references);
  expect(() => decodeCompanionFramedSyncTransfer({
    ...input, resourceStorageKeys: [`${'f'.repeat(64)}.pdf`]
  })).toThrow('framed_sync_android_resource_identity_mismatch');
  expect(() => decodeCompanionFramedSyncTransfer({
    ...input, resourceRows: [row({ ...resourceBlob, role: 4 }, { storage_key: storageKey })]
  })).toThrow('framed_sync_android_resource_identity_mismatch');
});

function row(blob: CanonicalBlob, extra: DbRow): DbRow {
  return { byte_length: Number(blob.byteLength), required: blob.required ? 1 : 0,
    role: blob.role, sha256: blob.sha256, ...extra };
}

function nodeRecord(): NativeSyncNodeRecord {
  const time = '2026-10-05T01:00:00.000Z';
  return {
    ancestor_version_ids: [], body_text: 'Transferred body', content_hash: '4'.repeat(64),
    host_name: 'sender', is_tombstone: false, object_id: 'node-1', object_type: 'node',
    parent_version_id: null, parent_version_ids: [], updated_at: time,
    version_created_at: time, version_id: 'version-1',
    snapshot: {
      anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
      attachments: [], body_blob_hash: null, created_at: time, deleted_at: null,
      desired_retention: null, enable_short_term: false, hide_title_heading: false,
      id: 'node-1', image_regions: null, image_sources: null,
      import_content_fingerprint: null, import_source_fingerprint: null,
      is_title_manual: true, kind: 'topic', manual_child_order: null, opening_text: null,
      parent_id: null, position: 0, priority: 0, resource_references: '[]', reveal: null,
      sequential_reading_enabled: false, shelved_at: null, title: 'Node', updated_at: time,
      virtual_filter: null
    }
  };
}

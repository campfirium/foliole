// @vitest-environment node

import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';

import { closeApplyHarnesses, harness, input, nodeRecord, reviewFact, stage } from '../../../../../../electron/database/companionFramedSyncApplyHarness.testSupport.js';
import type { CanonicalBlob, CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';

afterEach(closeApplyHarnesses);

it.each(['android', 'ios'] as const)(
  'atomically applies one %s node with auxiliary facts and its business receipt', async (kind) => {
  const { main, port, prefix, staging, stagingPath } = await harness(kind);

  const projection = projectFramedSyncNodeRecord(nodeRecord());
  const transferId = new Uint8Array(32).fill(1);
  const blob = projection.manifest.blobs[0]!;
  const review = reviewFact('review-1');
  stage(staging, prefix, {
    blob: { data: projection.bodyBlob, descriptor: blob },
    facts: [projection.manifest.facts[0]!, review], transferId
  });

  const input = {
    receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    stagingKind: kind, stagingPath, transferId
  };
  const receipt = await applyCompanionFramedSyncTransfer(port, input);
  await applyCompanionFramedSyncTransfer(port, input);

  expect(receipt).toMatchObject({ receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' });
  expect(main.prepare(`SELECT title, content, current_version_id FROM nodes WHERE id = ?`)
    .get('node-1')).toEqual({ content: 'Transferred body', current_version_id: 'version-1', title: 'Node' });
  expect(main.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  expect(main.prepare('SELECT op_id FROM review_log').all()).toEqual([{ op_id: 'review-1' }]);
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 1 });
  expect(bytesToHex(receipt.appliedStateHash)).toBe('4'.repeat(64));
});

it.each(['android', 'ios'] as const)('persists a complete one-MiB Unicode body on its %s node and original version', async (kind) => {
  const { main, port, prefix, staging, stagingPath } = await harness(kind);
  const body = '中😀'.repeat(149_796) + 'abcd';
  expect(Buffer.byteLength(body)).toBe(1_048_576);
  const record = nodeRecord();
  record.body_text = body;
  const projection = projectFramedSyncNodeRecord(record);
  const transferId = new Uint8Array(32).fill(9);
  stage(staging, prefix, { blob: { data: projection.bodyBlob, descriptor: projection.manifest.blobs[0]! },
    facts: projection.manifest.facts, transferId });
  const receipt = await applyCompanionFramedSyncTransfer(port, input(kind, stagingPath, transferId));
  expect(main.prepare("SELECT content = ? AS exact, current_version_id FROM nodes WHERE id='node-1'").get(body))
    .toEqual({ exact: 1, current_version_id: 'version-1' });
  expect(main.prepare("SELECT body_text = ? AS exact FROM node_sync_versions WHERE version_id='version-1'").get(body))
    .toEqual({ exact: 1 });
  expect(main.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  expect(await applyCompanionFramedSyncTransfer(port, input(kind, stagingPath, transferId))).toEqual(receipt);
});

it.each(['android', 'ios'] as const)(
  'applies a zero-blob %s review-only transfer and receipts the current node state', async (kind) => {
  const { main, port, prefix, staging, stagingPath } = await harness(kind);
  const projection = projectFramedSyncNodeRecord(nodeRecord());
  const first = new Uint8Array(32).fill(1);
  stage(staging, prefix, { blob: { data: projection.bodyBlob,
    descriptor: projection.manifest.blobs[0]! }, facts: projection.manifest.facts, transferId: first });
  await applyCompanionFramedSyncTransfer(port, input(kind, stagingPath, first));
  const second = new Uint8Array(32).fill(7);
  stage(staging, prefix, {
    facts: [reviewFact('review-only-1'), reviewFact('review-only-2')], transferId: second
  });

  const receipt = await applyCompanionFramedSyncTransfer(port, input(kind, stagingPath, second));

  expect(main.prepare('SELECT op_id FROM review_log ORDER BY op_id').all())
    .toEqual([{ op_id: 'review-only-1' }, { op_id: 'review-only-2' }]);
  expect(bytesToHex(receipt.appliedStateHash)).toBe('4'.repeat(64));
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 2 });
});

it('rejects unsupported facts, multiple identities, and mismatched blob sets', async () => {
  const projection = projectFramedSyncNodeRecord(nodeRecord());
  const node = projection.manifest.facts[0]!;
  const review = reviewFact('unsupported');
  const cases: readonly Readonly<{
    error: string;
    facts: readonly CanonicalFact[];
    blob?: { data: Uint8Array; descriptor: CanonicalBlob };
  }>[] = [
    { error: 'framed_sync_android_fact_set_unsupported', facts: [{ ...review, kind: 5 }] },
    { error: 'framed_sync_android_fact_identity_mismatch',
      facts: [review, reviewFact('other-node', 'node-2')] },
    { blob: { data: projection.bodyBlob, descriptor: {
      ...projection.manifest.blobs[0]!, sha256: new Uint8Array(32).fill(9)
    } }, error: 'framed_sync_android_blob_identity_mismatch', facts: [node] }
  ];
  for (const [index, value] of cases.entries()) {
    const { port, prefix, staging, stagingPath } = await harness('android');
    const transferId = new Uint8Array(32).fill(10 + index);
    stage(staging, prefix, { ...value, transferId });
    await expect(applyCompanionFramedSyncTransfer(
      port, input('android', stagingPath, transferId)
    )).rejects.toThrow(value.error);
  }
});

it.each(['android', 'ios'] as const)(
  'atomically applies a %s parent-first version chain for one node', async (kind) => {
  const { main, port, prefix, staging, stagingPath } = await harness(kind);
  const root = projectFramedSyncNodeRecord(nodeRecord());
  const childRecord = nodeRecord();
  childRecord.ancestor_version_ids = ['version-1'];
  childRecord.body_text = 'Transferred child body';
  childRecord.content_hash = '5'.repeat(64);
  childRecord.parent_version_id = 'version-1';
  childRecord.parent_version_ids = ['version-1'];
  childRecord.version_id = 'version-2';
  childRecord.snapshot.title = 'Child';
  childRecord.snapshot.updated_at = '2026-10-05T01:01:00.000Z';
  childRecord.updated_at = childRecord.snapshot.updated_at;
  childRecord.version_created_at = childRecord.snapshot.updated_at;
  const child = projectFramedSyncNodeRecord(childRecord);
  const transferId = new Uint8Array(32).fill(6);
  stage(staging, prefix, {
    blobs: [
      { data: root.bodyBlob, descriptor: root.manifest.blobs[0]! },
      { data: child.bodyBlob, descriptor: child.manifest.blobs[0]! }
    ],
    facts: [...root.manifest.facts, ...child.manifest.facts], transferId
  });

  await applyCompanionFramedSyncTransfer(port, input(kind, stagingPath, transferId));

  expect(main.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'version-1' }, { version_id: 'version-2' }]);
  expect(main.prepare('SELECT title, current_version_id FROM nodes WHERE id = ?').get('node-1'))
    .toEqual({ current_version_id: 'version-2', title: 'Child' });
});

it('reports a missing parent dependency before SQLite rejects the framed Node', async () => {
  const { main, port, prefix, staging, stagingPath } = await harness('android');
  const record = nodeRecord();
  record.object_id = 'child';
  record.snapshot.id = 'child';
  record.snapshot.parent_id = 'parent';
  const projection = projectFramedSyncNodeRecord(record);
  const transferId = new Uint8Array(32).fill(8);
  stage(staging, prefix, { blob: { data: projection.bodyBlob,
    descriptor: projection.manifest.blobs[0]! }, facts: projection.manifest.facts, transferId });

  await expect(applyCompanionFramedSyncTransfer(port, input('android', stagingPath, transferId)))
    .rejects.toThrow('framed_sync_node_parent_missing:parent');
  expect(main.prepare('SELECT COUNT(*) AS count FROM nodes').get()).toEqual({ count: 0 });
});

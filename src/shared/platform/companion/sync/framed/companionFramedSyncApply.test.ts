// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bytesToHex } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionFramedSyncInventory } from '../../../../../../lib/core/database/framedSyncInventoryMigration.js';
import type { CanonicalBlob, CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { projectFramedSyncReview } from '../../../../../../lib/core/sync/framedSyncRelationReviewFact.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';

const roots: string[] = [];
const databases: Database.Database[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true }));
});

it.each(['android', 'ios'] as const)(
  'atomically applies one %s node with auxiliary facts and its business receipt', async (kind) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-framed-apply-'));
  roots.push(root);
  const stagingPath = path.join(root, 'staging.db');
  const main = tracked(new Database(':memory:'));
  const staging = tracked(new Database(stagingPath));
  main.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  await migrateCompanionFramedSyncInventory(createBetterSqliteDbPort(main));
  const prefix = `framed_sync_${kind}`;
  installCompanionFramedSyncStaging(staging, prefix);

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
  const port = createBetterSqliteDbPort(main, { name: 'framed-apply-test' });
  const receipt = await applyCompanionFramedSyncTransfer(port, input);
  await applyCompanionFramedSyncTransfer(port, input);

  expect(receipt).toMatchObject({ receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' });
  expect(main.prepare(`SELECT n.title, CAST(cbd.data AS TEXT) AS content, n.current_version_id
      FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`)
    .get('node-1')).toEqual({ content: 'Transferred body', current_version_id: 'version-1', title: 'Node' });
  expect(main.prepare('SELECT op_id FROM review_log').all()).toEqual([{ op_id: 'review-1' }]);
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 1 });
  expect(bytesToHex(receipt.appliedStateHash)).toBe('4'.repeat(64));
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

async function harness(kind: 'android' | 'ios') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-framed-apply-'));
  roots.push(root);
  const stagingPath = path.join(root, 'staging.db');
  const main = tracked(new Database(':memory:'));
  const staging = tracked(new Database(stagingPath));
  main.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  await migrateCompanionFramedSyncInventory(createBetterSqliteDbPort(main));
  const prefix = `framed_sync_${kind}`;
  installCompanionFramedSyncStaging(staging, prefix);
  return { main, port: createBetterSqliteDbPort(main, { name: 'framed-apply-test' }),
    prefix, staging, stagingPath };
}

function input(kind: 'android' | 'ios', stagingPath: string, transferId: Uint8Array) {
  return { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
    senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
    stagingKind: kind, stagingPath, transferId };
}

function reviewFact(opId: string, nodeId = 'node-1') {
  const time = '2026-10-05T02:00:00.000Z';
  return projectFramedSyncReview({
    difficulty_after: 3.75, difficulty_before: 2.25, due_after: time, due_before: time,
    grade: 3, host_name: 'sender', id: `row-${opId}`, node_id: nodeId, op_id: opId,
    reviewed_at: time, scheduler_version: 'fsrs-6', stability_after: 4.5, stability_before: 2.5
  });
}

function stage(database: Database.Database, prefix: string, value: {
  blob?: { data: Uint8Array; descriptor: CanonicalBlob };
  blobs?: readonly { data: Uint8Array; descriptor: CanonicalBlob }[];
  facts: readonly CanonicalFact[];
  transferId: Uint8Array;
}) {
  const discriminator = value.transferId.at(0);
  if (discriminator === undefined) throw new Error('transfer_id_empty');
  const attemptId = new Uint8Array(16).fill(discriminator);
  database.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, ?, ?, ?, ?, ?, 'ready_to_apply')`).run(
    value.transferId, new Uint8Array(32).fill(discriminator),
    'sender', 'sender-epoch', 'receiver', 'receiver-epoch', attemptId
  );
  const insertFrame = database.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, ?, ?)`);
  value.facts.forEach((fact, index) => insertFrame.run(
    value.transferId, attemptId, String(index), 3,
    encodeValidatedProtocolMessage('fact', factToWire(fact))
  ));
  for (const { data, descriptor } of value.blobs ?? (value.blob ? [value.blob] : [])) {
    database.prepare(`INSERT OR IGNORE INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
      .run(descriptor.sha256, Number(descriptor.byteLength), data);
    database.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, ?, ?)`)
      .run(value.transferId, descriptor.sha256, Number(descriptor.byteLength), descriptor.role,
        descriptor.required ? 1 : 0);
  }
}

function tracked(database: Database.Database) {
  databases.push(database);
  return database;
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

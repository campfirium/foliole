// @vitest-environment node
import path from 'node:path';

import { hexToBytes } from '@noble/hashes/utils.js';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { closeLibraries, createPeer, edit, root, startLibraries } from '../../../../../../electron/database/syncEmptyLibraryTestSupport.js';
import { bootstrapCompanionDatabase } from '../../../../../../lib/core/database/companionDatabaseLifecycle.js';
import type { CompanionFramedSyncOutboundValue } from '../../../../../../lib/core/sync/framedSyncCompanionOutboundContract.js';
import { collectNodeVersionPayloads } from '../../../../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadRetainedSyncNodeVersionRecords } from '../../../../../../lib/core/sync/syncNodeGraph.js';

import { applyCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';
import { prepareCompanionFramedSyncOutbound } from './companionFramedSyncOutbound.js';

beforeEach(startLibraries);
afterEach(closeLibraries);

function stage(db: Database.Database, prefix: string, value: CompanionFramedSyncOutboundValue) {
  installCompanionFramedSyncStaging(db, prefix);
  const transfer = hexToBytes(value.transfer_id);
  const attempt = new Uint8Array(16).fill(2);
  db.prepare(`INSERT INTO ${prefix}_transfers VALUES
    (?, ?, 'sender', 'sender-epoch', 'receiver', 'receiver-epoch', ?, 'ready_to_apply')`)
    .run(transfer, hexToBytes(value.content_id), attempt);
  value.fact_message_bytes_list.forEach((bytes, index) => {
    db.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, ?, 3, ?)`)
      .run(transfer, attempt, String(index), new Uint8Array(bytes));
  });
  for (const blob of value.blobs) {
    expect(blob.data_text).toBeTypeOf('string');
    db.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, ?, ?)`)
      .run(transfer, hexToBytes(blob.sha256), Number(blob.byte_length), blob.role, Number(blob.required));
    db.prepare(`INSERT INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
      .run(hexToBytes(blob.sha256), Number(blob.byte_length), Buffer.from(blob.data_text!));
  }
}

it.each(['android', 'ios'] as const)('recovers %s atomic business apply after receipt failure and lost acknowledgement', async (kind) => {
  const source = createPeer('history-source');
  const original = edit(source, 'Original history body');
  edit(source, 'Current body');
  await collectNodeVersionPayloads(source.port, 'topic', 32, true);
  expect(source.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(original)).toBeNull();
  const value = await prepareCompanionFramedSyncOutbound(source.port, {
    group_id: 'group', sender_device_id: 'sender', sender_library_epoch: 'sender-epoch',
    receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch',
    object_id: 'topic', object_type: 'node', include_current_node: true,
    required_relation_ids: [], review_fact_ids: [], state_fact_ids: []
  });
  expect(value.blobs).toHaveLength(1);
  edit(source, 'Later unpublished body');
  expect(await collectNodeVersionPayloads(source.port, 'topic', 32, true)).toMatchObject({ skipped: null });
  source.db.close(); source.db = new Database(source.file);
  source.port = createBetterSqliteDbPort(source.db);
  const restored = await prepareCompanionFramedSyncOutbound(source.port, {
    group_id: 'group', sender_device_id: 'sender', sender_library_epoch: 'sender-epoch',
    receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch',
    transfer_id: value.transfer_id
  });
  expect(restored).toEqual({ ...value, publication_state: 'identical' });
  const file = path.join(root, `${kind}-business.db`);
  const stagingPath = path.join(root, `${kind}-staging.db`);
  let receiver = new Database(file);
  const staging = new Database(stagingPath);
  try {
    await bootstrapCompanionDatabase(createBetterSqliteDbPort(receiver),
      { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
    stage(staging, `framed_sync_${kind}`, value);
    const input = { receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', stagingKind: kind,
      stagingPath, transferId: hexToBytes(value.transfer_id) };
    const tables = ['nodes', 'node_sync_versions', 'content_blob_data', 'framed_sync_inventory', 'framed_sync_receipts'];
    const before = tables.map((table) => receiver.prepare(`SELECT * FROM ${table}`).all());
    receiver.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON framed_sync_receipts
      BEGIN SELECT RAISE(ABORT, 'receipt_disk_failure'); END`);
    await expect(applyCompanionFramedSyncTransfer(createBetterSqliteDbPort(receiver), input))
      .rejects.toThrow('receipt_disk_failure');
    expect(tables.map((table) => receiver.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
    receiver.close(); receiver = new Database(file);
    receiver.exec('DROP TRIGGER fail_receipt');
    const receipt = await applyCompanionFramedSyncTransfer(createBetterSqliteDbPort(receiver), input);
    receiver.close(); receiver = new Database(file);
    expect(await applyCompanionFramedSyncTransfer(createBetterSqliteDbPort(receiver), input)).toEqual(receipt);
    expect(receiver.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(original)).toBeNull();
    expect(receiver.prepare('SELECT COUNT(*) FROM node_sync_version_parents').pluck().get()).toBe(1);
    expect(receiver.prepare('SELECT COUNT(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
    expect(receiver.prepare('SELECT CAST(data AS TEXT) FROM content_blob_data').pluck().all()).toEqual(['Current body']);
  } finally { receiver.close(); staging.close(); }
});

it.each(['android', 'ios'] as const)('preserves a %s receiver original body when the sender forwards retired metadata', async (kind) => {
  const source = createPeer('retired-source');
  const receiver = createPeer('complete-receiver');
  const original = edit(source, 'Original body');
  const record = await loadCurrentSyncNodeRecord(source.port, 'topic');
  expect(record).not.toBeNull();
  await applySyncNodesWithDbPort(receiver.port, [record!]);
  edit(source, 'New body');
  await collectNodeVersionPayloads(source.port, 'topic', 32, true);
  expect(source.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(original)).toBeNull();
  const value = await prepareCompanionFramedSyncOutbound(source.port, {
    group_id: 'group', sender_device_id: 'sender', sender_library_epoch: 'sender-epoch',
    receiver_device_id: 'receiver', receiver_library_epoch: 'receiver-epoch',
    object_id: 'topic', object_type: 'node', include_current_node: true,
    required_relation_ids: [], review_fact_ids: [], state_fact_ids: []
  });
  const stagingPath = path.join(root, `${kind}-preserve.db`);
  const staging = new Database(stagingPath);
  try {
    stage(staging, `framed_sync_${kind}`, value);
    await applyCompanionFramedSyncTransfer(receiver.port, {
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', stagingKind: kind,
      stagingPath, transferId: hexToBytes(value.transfer_id)
    });
    expect(receiver.db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(original))
      .toBe('Original body');
    expect(receiver.db.prepare('SELECT COUNT(*) FROM node_sync_version_parents').pluck().get()).toBe(1);
  } finally { staging.close(); }
});

it('rejects a missing current body instead of publishing it as retired history', async () => {
  const source = createPeer('missing-current');
  const version = edit(source, 'Required current body');
  source.db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
    snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`).run(version);
  await expect(loadRetainedSyncNodeVersionRecords(source.port, [version]))
    .rejects.toThrow(`sync_node_version_body_unavailable:${version}`);
  expect(source.db.prepare('SELECT COUNT(*) FROM framed_sync_outbound_publications').pluck().get()).toBe(0);
});

// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../../electron/database/betterSqliteDbPort.js';
import { bootstrapCompanionDatabase } from '../../../../../../lib/core/database/companionDatabaseLifecycle.js';
import { readFramedSyncInventory, readFramedSyncOverwriteInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { projectFramedSyncNodeRecord } from '../../../../../../lib/core/sync/framedSyncNodeProjection.js';
import { encodeValidatedProtocolMessage } from '../../../../../../lib/core/sync/framedSyncProtocolCodec.js';
import { factToWire } from '../../../../../../lib/core/sync/framedSyncWireProjection.js';
import { beginSyncGroupLocalAdoption, finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';
import type { SyncGroupMemberStatePayload } from '../../../../../../lib/platform/syncGroupMemberStateContract.js';
import { assertCompanionPeerProofFresh } from '../nodeVersionCompanionPeerProof.js';

import { applyCompanionFramedSyncTransfer, prepareCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { installCompanionFramedSyncStaging } from './companionFramedSyncApply.testSupport.js';
import { applyPreparedCompanionFramedSyncTransfers } from './companionFramedSyncApplyPrepared.js';

const databases: Database.Database[] = [];
const roots: string[] = [];
const adoption = { endpointUrl: 'http://localhost:38641', groupId: 'group-1',
  libraryEpoch: 'adoption-epoch', providerDeviceId: 'sender',
  providerDeviceName: 'Sender', providerPlatform: 'darwin' };
const progress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch, providerDeviceId: 'sender',
  providerLibraryEpoch: 'sender-epoch', receiverDeviceId: 'receiver', receiverLibraryEpoch: adoption.libraryEpoch };
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

async function setup(kind: 'android' | 'ios') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-local-adoption-'));
  roots.push(root);
  const main = new Database(path.join(root, 'main.db'));
  const stagingPath = path.join(root, 'staging.db');
  const staging = new Database(stagingPath);
  databases.push(main, staging);
  const port = createBetterSqliteDbPort(main);
  await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'receiver', now: '2026-10-06' });
  const prefix = `framed_sync_${kind}`;
  installCompanionFramedSyncStaging(staging, prefix);
  let index = 0;
  const prepare = async (record: NativeSyncNodeRecord) => {
    const projection = projectFramedSyncNodeRecord(record);
    const transferId = new Uint8Array(32).fill(++index);
    const attemptId = new Uint8Array(16).fill(index);
    staging.prepare(`INSERT INTO ${prefix}_transfers VALUES
      (?, ?, 'sender', 'sender-epoch', 'receiver', 'adoption-epoch', ?, 'ready_to_apply')`)
      .run(transferId, transferId, attemptId);
    staging.prepare(`INSERT INTO ${prefix}_frames VALUES (?, ?, '0', 3, ?)`)
      .run(transferId, attemptId, encodeValidatedProtocolMessage('fact', factToWire(projection.manifest.facts[0]!)));
    const blob = projection.manifest.blobs[0]!;
    staging.prepare(`INSERT OR IGNORE INTO ${prefix}_available_blobs VALUES (?, ?, ?)`)
      .run(blob.sha256, Number(blob.byteLength), projection.bodyBlob);
    staging.prepare(`INSERT INTO ${prefix}_blob_pins VALUES (?, ?, ?, 1, 1)`)
      .run(transferId, blob.sha256, Number(blob.byteLength));
    return prepareCompanionFramedSyncTransfer(port, { stagingKind: kind, stagingPath, transferId,
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'adoption-epoch' });
  };
  await applyPreparedCompanionFramedSyncTransfers(port, [await prepare(nodeRecord('local'))]);
  await port.transaction((tx) => beginSyncGroupLocalAdoption(tx, adoption));
  return { main, port, prepare };
}

it.each(['android', 'ios'] as const)('clears once and commits %s objects independently', async (kind) => {
  const { main, port, prepare } = await setup(kind);
  const first = await prepare(nodeRecord('group-a'));
  const second = await prepare(nodeRecord('group-b'));
  expect(main.prepare('SELECT id FROM nodes WHERE id = ?').get('local')).toEqual({ id: 'local' });
  expect(main.prepare('SELECT id FROM nodes WHERE id = ?').get('group-a')).toBeUndefined();
  expect(await readFramedSyncInventory(port)).toEqual([]);
  await expect(applyCompanionFramedSyncTransfer(port, first.input)).rejects.toThrow('sync_group_local_adoption_pending');
  expect(await loadSyncGroupLocalAdoption(port)).toEqual(adoption);

  expect((await prepareSyncGroupOverwrite(port, progress)).cleared).toBe(true);
  await applyPreparedCompanionFramedSyncTransfers(port, [first]);
  expect((await prepareSyncGroupOverwrite(port, progress)).cleared).toBe(false);
  expect(await readFramedSyncOverwriteInventory(port, { groupId: progress.groupId, protocolVersion: 22,
    senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch,
    receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch })).toHaveLength(1);
  await applyPreparedCompanionFramedSyncTransfers(port, [second]);
  await port.transaction(async (tx) => {
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, adoption);
  });

  expect(main.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").all())
    .toEqual([{ id: 'group-a' }, { id: 'group-b' }]);
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 2 });
  expect(await loadSyncGroupLocalAdoption(port)).toBeNull();
  expect(await readFramedSyncInventory(port)).toHaveLength(2);
  await applyCompanionFramedSyncTransfer(port, first.input);
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 2 });
});

it.each(['android', 'ios'] as const)('preserves committed %s units when the next object is invalid', async (kind) => {
  const { main, port, prepare } = await setup(kind);
  const valid = await prepare(nodeRecord('group-a'));
  const invalidRecord = nodeRecord('group-b');
  invalidRecord.snapshot.parent_id = 'missing-parent';
  const invalid = await prepare(invalidRecord);

  await prepareSyncGroupOverwrite(port, progress);
  await applyPreparedCompanionFramedSyncTransfers(port, [valid]);
  await expect(applyPreparedCompanionFramedSyncTransfers(port, [invalid]))
    .rejects.toThrow('framed_sync_node_parent_missing:missing-parent');

  expect(main.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%'").all()).toEqual([{ id: 'group-a' }]);
  expect(await loadSyncGroupLocalAdoption(port)).toEqual(adoption);
  expect(main.prepare('SELECT COUNT(*) AS count FROM framed_sync_receipts').get()).toEqual({ count: 1 });
  expect(main.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'group-b'").all()).toEqual([]);
  expect((await prepareSyncGroupOverwrite(port, progress)).cleared).toBe(false);
  await applyPreparedCompanionFramedSyncTransfers(port, [valid]);
  expect(main.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%'").all()).toEqual([{ id: 'group-a' }]);
});

it.each(['android', 'ios'] as const)('adopts an empty %s group without publishing a restore event', async (kind) => {
  const { main, port } = await setup(kind);
  await prepareSyncGroupOverwrite(port, progress);
  await port.transaction(async (tx) => {
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, adoption);
  });
  expect(main.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%'").all()).toEqual([]);
  expect(main.prepare('SELECT * FROM sync_group_restore_events').all()).toEqual([]);
  expect(await loadSyncGroupLocalAdoption(port)).toBeNull();
});

it.each(['android', 'ios'] as const)('accepts an explicit adopted %s epoch once and still rejects proof rollback', async (kind) => {
  const { main, port } = await setup(kind);
  const state: SyncGroupMemberStatePayload = {
    contract_version: 3, adopted_from: 'provider', devices: [{
      contract_version: 1, device_identity_key: 'provider', device_anchor: 'anchor',
      canonical_library_path: '/library', device_name: 'Provider', platform: 'darwin',
      state: 'active', joined_at: '2026-10-06', updated_at: '2026-10-06', left_at: null, last_seen_at: null
    }], group_id: 'group-1', library_epoch: 'new-epoch', proof_revision: 0,
    source_proof_revisions: {}, removals: [], restore: null, sender_device_identity_key: 'sender'
  };
  main.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES ('group-1', 'sender', 'old-epoch', 2, 'prior', '2026-10-06')`).run();
  const ordinaryState = { ...state };
  delete ordinaryState.adopted_from;
  await expect(port.transaction((tx) => assertCompanionPeerProofFresh(tx, ordinaryState, 'receiver')))
    .rejects.toThrow('node_version_peer_restore_requires_rejoin');
  await port.transaction((tx) => assertCompanionPeerProofFresh(tx, state, 'receiver'));
  main.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES ('group-1', 'sender', 'new-epoch', 2, 'current', '2026-10-06')`).run();
  await expect(port.transaction((tx) => assertCompanionPeerProofFresh(tx, state, 'receiver')))
    .rejects.toThrow('node_version_peer_restore_requires_rejoin');
  await expect(port.transaction((tx) => assertCompanionPeerProofFresh(tx, {
    ...state, library_epoch: 'old-epoch'
  }, 'receiver'))).rejects.toThrow('node_version_peer_restore_requires_rejoin');
  await port.transaction((tx) => assertCompanionPeerProofFresh(tx, {
    ...state, source_proof_revisions: { receiver: 2 }
  }, 'receiver'));
});

function nodeRecord(id: string): NativeSyncNodeRecord {
  const time = '2026-10-05T01:00:00.000Z';
  return {
    ancestor_version_ids: [], body_text: 'Transferred body', content_hash: '4'.repeat(64),
    host_name: 'sender', is_tombstone: false, object_id: id, object_type: 'node',
    parent_version_id: null, parent_version_ids: [], updated_at: time,
    version_created_at: time, version_id: `version-${id}`,
    snapshot: {
      anchor_link: null, anchor_resolution_status: null, anchor_source_version_id: null,
      attachments: [], body_blob_hash: null, created_at: time, deleted_at: null,
      desired_retention: null, enable_short_term: false, hide_title_heading: false,
      id, image_regions: null, image_sources: null,
      import_content_fingerprint: null, import_source_fingerprint: null,
      is_title_manual: true, kind: 'topic', manual_child_order: null, opening_text: null,
      parent_id: null, position: 0, priority: 0, resource_references: '[]', reveal: null,
      sequential_reading_enabled: false, shelved_at: null, title: 'Node', updated_at: time,
      virtual_filter: null
    }
  };
}

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
import { applyRequestSyncObject, type RequestSyncObjectInput } from '../../../../../../lib/core/sync/requestSyncObjectApply.js';
import { beginSyncGroupLocalAdoption, finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';
import type { SyncGroupMemberStatePayload } from '../../../../../../lib/platform/syncGroupMemberStateContract.js';
import { assertCompanionPeerProofFresh } from '../nodeVersionCompanionPeerProof.js';

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
  databases.push(main);
  const port = createBetterSqliteDbPort(main);
  await bootstrapCompanionDatabase(port, { allowCreate: true, expectedHostName: 'receiver', expectedJournalMode: 'wal', now: '2026-10-06' });
  expect(main.pragma('journal_mode', { simple: true })).toBe('wal');
  main.exec(`INSERT INTO sync_groups VALUES ('group-1', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'receiver', 'active', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group-1', 'sender', 'sender-anchor', '/sender', 'Sender', 'mac', 'active', 'now', 'now'),
      ('group-1', 'receiver', 'receiver-anchor', '/receiver', 'Receiver', '${kind}', 'active', 'now', 'now')`);
  let index = 0;
  const prepare = async (record: NativeSyncNodeRecord): Promise<RequestSyncObjectInput> => {
    const projection = projectFramedSyncNodeRecord(record);
    return {
      context: { groupId: adoption.groupId, protocolVersion: 27,
        senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch', receiverDeviceId: 'receiver',
        receiverLibraryEpoch: adoption.libraryEpoch },
      globalId: record.object_id, objectType: record.object_type, requestId: new Uint8Array(16).fill(++index),
      peerState: { contract_version: 3, group_id: adoption.groupId, sender_device_identity_key: 'sender',
        library_epoch: 'sender-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
      facts: async function* () { yield* projection.manifest.facts; },
      loadBody: async () => projection.bodyBlob,
      enqueueSearchInvalidations: false
    };
  };
  await port.transaction(tx => applySyncNodesWithDbPort(tx, [nodeRecord('local')], { enqueueSearchInvalidations: false }));
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
  await expect(applyRequestSyncObject(port, first)).rejects.toThrow('sync_group_local_adoption_pending');
  expect(await loadSyncGroupLocalAdoption(port)).toEqual(adoption);

  expect((await prepareSyncGroupOverwrite(port, progress)).cleared).toBe(true);
  await applyRequestSyncObject(port, first);
  expect((await prepareSyncGroupOverwrite(port, progress)).cleared).toBe(false);
  expect(await readFramedSyncOverwriteInventory(port, { groupId: progress.groupId, protocolVersion: 27,
    senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch,
    receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch })).toHaveLength(1);
  await applyRequestSyncObject(port, second);
  await port.transaction(async (tx) => {
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, adoption);
  });

  expect(main.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%' ORDER BY id").all())
    .toEqual([{ id: 'group-a' }, { id: 'group-b' }]);
  expect(await loadSyncGroupLocalAdoption(port)).toBeNull();
  expect(await readFramedSyncInventory(port)).toHaveLength(2);
  const nodes = main.prepare('SELECT * FROM nodes ORDER BY id').all();
  const versions = main.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  await applyRequestSyncObject(port, first);
  expect(main.prepare('SELECT * FROM nodes ORDER BY id').all()).toEqual(nodes);
  expect(main.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(versions);
});

it.each(['android', 'ios'] as const)('preserves committed %s units when the next object is invalid', async (kind) => {
  const { main, port, prepare } = await setup(kind);
  const valid = await prepare(nodeRecord('group-a'));
  const invalidRecord = nodeRecord('group-b');
  invalidRecord.snapshot.parent_id = 'missing-parent';
  const invalid = await prepare(invalidRecord);

  await prepareSyncGroupOverwrite(port, progress);
  await applyRequestSyncObject(port, valid);
  await expect(applyRequestSyncObject(port, invalid))
    .rejects.toThrow('framed_sync_node_parent_missing:missing-parent');

  expect(main.prepare("SELECT id FROM nodes WHERE id NOT LIKE 'special-%'").all()).toEqual([{ id: 'group-a' }]);
  expect(await loadSyncGroupLocalAdoption(port)).toEqual(adoption);
  expect(main.prepare("SELECT version_id FROM node_sync_versions WHERE object_id = 'group-b'").all()).toEqual([]);
  expect((await prepareSyncGroupOverwrite(port, progress)).cleared).toBe(false);
  await applyRequestSyncObject(port, valid);
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
  main.prepare("INSERT INTO sync_group_metadata (key, value, updated_at) VALUES ('sync_group_coverage:group-1', ?, 'now')")
    .run(JSON.stringify({ basis: '', cells: { sender: { receiver: '2026-10-06T00:00:00.000Z' } } }));
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

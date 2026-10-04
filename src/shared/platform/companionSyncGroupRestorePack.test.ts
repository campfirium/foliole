// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { buildDesktopSyncPackFromDriver } from '../../../electron/database/syncPackBuilderFromDriver.js';
import { initializeDatabaseSchema } from '../../../lib/core/database/migrations.js';
import { collectNodeVersionPayloads } from '../../../lib/core/sync/nodeVersionPayloadCollector.js';
import { clearWorkgroupSyncDataForRestore } from '../../../lib/core/sync/syncGroupRestoreReset.js';
import { createSyncGroupDeviceIdentity } from '../../../lib/platform/syncGroupUnifiedContract.js';

import { applyCompanionSyncPackNodesWithDbPort } from './companionSyncPackNodes.js';

const restoreId = 'restore-later';
const groupId = 'group-1';
const sourceIdentity = createSyncGroupDeviceIdentity({ device_anchor: 'a1111111-1111-4111-8111-111111111111',
  group_id: groupId, library_path: '/library/a', path_flavor: 'posix' });
const targetIdentity = createSyncGroupDeviceIdentity({ device_anchor: 'b2222222-2222-4222-8222-222222222222',
  group_id: groupId, library_path: '/library/b', path_flavor: 'posix' });
const sourceId = sourceIdentity.identity_key;
const targetId = targetIdentity.identity_key;
const at = '2026-09-27T12:00:00.000Z';

function seedStaleIdentityEvidence(target: Database.Database) {
  target.exec(`INSERT INTO sync_identity_index_rows VALUES
    ('node', 'b-only-node', 7, 'old', 'now');
    INSERT INTO sync_identity_partition_digest VALUES (7, 'old', 1);
    UPDATE sync_identity_index_meta SET backfill_complete = 1 WHERE singleton_id = 1;
    INSERT INTO sync_identity_receive_rounds VALUES
    ('group-1', 'source', 'old-view', 0, 'old-page', 'now');
    INSERT INTO sync_identity_peer_baselines
    (group_id, local_device_id, peer_device_id, local_epoch, peer_epoch,
     local_watermark, peer_watermark, local_view_id, peer_view_id, verified_at)
    VALUES ('group-1', 'target', 'source', 'old', 'old', 'now', 'now',
      'old-view', 'old-view', 'now')`);
}

function assertIdentityEvidenceReset(target: Database.Database) {
  expect(target.prepare('SELECT * FROM sync_identity_index_rows').all()).toEqual([]);
  expect(target.prepare('SELECT * FROM sync_identity_partition_digest').all()).toEqual([]);
  expect(target.prepare('SELECT backfill_complete FROM sync_identity_index_meta').get())
    .toEqual({ backfill_complete: 0 });
  expect(target.prepare('SELECT * FROM sync_identity_receive_rounds').all()).toEqual([]);
  expect(target.prepare('SELECT * FROM sync_identity_peer_baselines').all()).toEqual([]);
}

it('replaces B-only data atomically with the chosen backup snapshot', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-pack-'));
  const source = database(sourceId);
  const target = database(targetId);
  try {
    seedNode(source, 'backup-node');
    seedNode(target, 'b-only-node');
    const previousEpoch = (target.prepare(`SELECT library_epoch FROM node_version_local_proof_state
      WHERE singleton_id = 1`).get() as { library_epoch: string }).library_epoch;
    target.prepare(`INSERT INTO node_version_device_revisions
      (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
      VALUES (?, ?, ?, 1, 'old-pack', ?)`).run(groupId, sourceId, previousEpoch, at);
    target.prepare(`INSERT INTO node_version_device_bases
      (group_id, device_identity_key, object_id, version_id, library_epoch,
       proof_revision, pack_id, updated_at)
      VALUES (?, ?, 'b-only-node', 'b-only-node-version', ?, 1, 'old-pack', ?)`)
      .run(groupId, sourceId, previousEpoch, at);
    target.prepare(`INSERT INTO setting_records
      (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
      VALUES ('b_only_setting', 'user_space', 'all', 'all', '*', 'true', 'hash', ?)`)
      .run(at);
    target.prepare(`INSERT INTO settings (key, value, updated_at)
      VALUES ('b_only_setting', 'true', ?)`).run(at);
    seedStaleIdentityEvidence(target);
    seedRestore(source, at);
    seedRestore(target, null);
    const packPath = path.join(root, 'snapshot.syncpack');
    await buildDesktopSyncPackFromDriver({ fromPeerId: sourceId, fromStateSeq: 0,
      outputPath: packPath, packId: 'pack-restore', restoreId, toPeerId: targetId },
    createBetterSqlite3Driver(source));
    const incomingPath = path.join(root, 'incoming.db');
    await fs.writeFile(incomingPath, inflatePack(await fs.readFile(packPath)));
    const port = createBetterSqliteDbPort(target);
    await applyCompanionSyncPackNodesWithDbPort({
      currentCursor: 0, deviceId: targetId, expectedRestoreId: restoreId,
      hostName: 'B', packPath: incomingPath, sourcePeerId: sourceId
    }, port);
    expect(target.prepare(`SELECT id FROM nodes WHERE id IN ('backup-node', 'b-only-node')
      ORDER BY id`).all()).toEqual([{ id: 'backup-node' }]);
    expect(target.prepare('SELECT applied_at FROM sync_group_restore_events').get())
      .toMatchObject({ applied_at: expect.any(String) });
    expect(target.prepare("SELECT key FROM settings WHERE key = 'b_only_setting'").get())
      .toBeUndefined();
    expect(target.prepare("SELECT object_id FROM sync_object_state WHERE object_id = 'b-only-node'").get())
      .toBeUndefined();
    expect(target.prepare('SELECT * FROM node_version_device_revisions').all()).toEqual([]);
    assertIdentityEvidenceReset(target);
    assertRestoredPeerBase(source, target);
    expect(target.prepare(`SELECT library_epoch, proof_revision FROM node_version_local_proof_state
      WHERE singleton_id = 1`).get()).toEqual({ library_epoch: restoreId, proof_revision: 0 });
    expect(await collectNodeVersionPayloads(port, 'backup-node'))
      .toEqual({ released: 0, skipped: null });
    await verifyOrdinarySyncAfterRestore(source, target, root);
  } finally {
    source.close();
    target.close();
    await fs.rm(root, { force: true, recursive: true });
  }
});

function assertRestoredPeerBase(source: Database.Database, target: Database.Database) {
  const sourceProof = source.prepare(`SELECT library_epoch, proof_revision
    FROM node_version_local_proof_state WHERE singleton_id = 1`).get() as {
      library_epoch: string; proof_revision: number
    };
  expect(target.prepare('SELECT * FROM node_version_device_bases').all()).toEqual([{
    group_id: groupId, device_identity_key: sourceId, object_id: 'backup-node',
    version_id: 'backup-node-version', ...sourceProof, pack_id: 'local-head', updated_at: at
  }]);
}

async function verifyOrdinarySyncAfterRestore(source: Database.Database,
  target: Database.Database, root: string) {
  const progress = target.prepare(`SELECT cursor_state_seq FROM sync_pack_receive_progress
    WHERE peer_id = ?`).get(sourceId) as { cursor_state_seq: number };
  seedNode(source, 'after-restore-node', progress.cursor_state_seq + 1);
  const packPath = path.join(root, 'ordinary.syncpack');
  await buildDesktopSyncPackFromDriver({ fromPeerId: sourceId,
    fromStateSeq: progress.cursor_state_seq, outputPath: packPath,
    packId: 'pack-after-restore', toPeerId: targetId }, createBetterSqlite3Driver(source));
  const incomingPath = path.join(root, 'ordinary.db');
  await fs.writeFile(incomingPath, inflatePack(await fs.readFile(packPath)));
  const args = { currentCursor: progress.cursor_state_seq, deviceId: targetId,
    hostName: 'B', packPath: incomingPath, sourcePeerId: sourceId };
  const port = createBetterSqliteDbPort(target);
  const result = await applyCompanionSyncPackNodesWithDbPort(args, port);
  expect(target.prepare("SELECT id FROM nodes WHERE id = 'after-restore-node'").get())
    .toEqual({ id: 'after-restore-node' });
  expect(target.prepare('SELECT restore_id, completed FROM sync_pack_receive_progress WHERE peer_id = ?')
    .get(sourceId)).toEqual({ restore_id: null, completed: 1 });
  const repeated = await applyCompanionSyncPackNodesWithDbPort({ ...args,
    currentCursor: result.to_state_seq }, port);
  expect(repeated.applied_object_count).toBe(0);
}

it('keeps the old library and pending event when replacement fails', async () => {
  const target = database(targetId);
  try {
    seedNode(target, 'b-only-node');
    seedRestore(target, null);
    const port = createBetterSqliteDbPort(target);
    await expect(port.transaction(async (tx) => {
      await clearWorkgroupSyncDataForRestore(tx, restoreId);
      throw new Error('downloaded_pack_invalid');
    })).rejects.toThrow('downloaded_pack_invalid');
    expect(target.prepare("SELECT id FROM nodes WHERE id = 'b-only-node'").get())
      .toEqual({ id: 'b-only-node' });
    expect(target.prepare('SELECT applied_at FROM sync_group_restore_events').get())
      .toEqual({ applied_at: null });
  } finally {
    target.close();
  }
});

function database(localId: string) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initializeDatabaseSchema(db);
  db.prepare(`INSERT INTO sync_groups VALUES (?, 'Group', 'secret', ?, ?)`).run(groupId, at, at);
  db.prepare(`INSERT INTO sync_group_local_state VALUES (1, ?, ?, 'active', ?)`)
    .run(groupId, localId, at);
  const member = db.prepare(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
     device_name, platform, state, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'desktop', 'active', ?, ?)`);
  member.run(groupId, sourceId, sourceIdentity.device_anchor, sourceIdentity.canonical_library_path,
    'A', at, at);
  member.run(groupId, targetId, targetIdentity.device_anchor, targetIdentity.canonical_library_path,
    'B', at, at);
  return db;
}

function seedNode(db: Database.Database, id: string, stateSeq = 1) {
  const content = `# ${id}`;
  const versionId = `${id}-version`;
  db.prepare(`INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES (?, 'topic', ?, ?, ?, ?, ?)`).run(id, id, content, versionId, at, at);
  db.prepare(`INSERT INTO node_sync_versions
    (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES (?, ?, 'A', ?, ?, ?, ?)`).run(versionId, id, at, `hash-${id}`, content,
      JSON.stringify({ id, kind: 'topic', title: id, content, created_at: at, updated_at: at }));
  db.prepare(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, current_version_id, content_hash,
     last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('node', ?, ?, ?, ?, 'A', ?, 1)`)
    .run(id, stateSeq, versionId, `hash-${id}`, at);
}

function seedRestore(db: Database.Database, appliedAt: string | null) {
  db.prepare(`INSERT INTO sync_group_restore_events
    (restore_id, group_id, restored_at, source_device_identity_key, applied_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(restoreId, groupId, at, sourceId, appliedAt, at);
}

function inflatePack(bytes: Buffer) {
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const length = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + length + bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + length).toString();
    if (name === 'incoming.db.deflate') return inflateSync(bytes.subarray(start, start + size));
    offset = start + size;
  }
  throw new Error('incoming_db_missing');
}

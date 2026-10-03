import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { confirmOutboundNodeVersionPack, stageOutboundNodeVersionHolds } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { advanceInboundNodePeerBases } from '../../lib/core/sync/nodeVersionInboundPeerBase.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let directory: string;
let sqlite: Database.Database;
let port: DbPort;

function open() {
  sqlite = new Database(join(directory, 'peer.db'));
  port = createBetterSqliteDbPort(sqlite);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'inbound-peer-base-'));
  open();
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`
    INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
      VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'local', 'anchor-local', '/local', 'Local', 'mac', 'active', 'now', 'now'),
        ('group', 'remote', 'anchor-remote', '/remote', 'Remote', 'android', 'active', 'now', 'now');
    INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES ('node', 'topic', 'Node', 'E', 'now', 'now');
    INSERT INTO node_version_device_revisions VALUES
      ('group', 'remote', 'epoch', 1, 'pack-1', NULL, 'now');
    INSERT INTO node_version_device_bases VALUES
      ('group', 'remote', 'node', 'A', 'epoch', 1, 'pack-1', 'now');
  `);
  for (const [index, versionId] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    const parent = index ? ['A', 'B', 'C', 'D'][index - 1] : null;
    sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node', ?, 'local', ?, ?, ?, ?)`).run(
      versionId, parent, `2026-09-27T00:00:0${index}Z`, `hash-${versionId}`, `body-${versionId}`,
      JSON.stringify({ id: 'node', content: `body-${versionId}` })
    );
    sqlite.prepare('INSERT INTO node_version_local_origins VALUES (?)').run(versionId);
    if (parent) sqlite.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, 0)').run(versionId, parent);
  }
});

afterEach(() => {
  sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

function base() {
  return sqlite.prepare(`SELECT version_id, library_epoch, proof_revision, pack_id
    FROM node_version_device_bases`).get();
}

it('persists authenticated inbound progress without manufacturing a pack receipt', async () => {
  await advanceInboundNodePeerBases(port, 'remote', [{ objectId: 'node', versionId: 'C' }]);
  sqlite.close();
  open();
  expect(base()).toEqual({ version_id: 'C', library_epoch: 'epoch', proof_revision: 1, pack_id: 'pack-1' });
  await collectNodeVersionPayloads(port, 'node');
  expect(sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'C' }, { version_id: 'E' }]);
  expect(sqlite.prepare('SELECT * FROM node_version_pack_receipts').all()).toEqual([]);
});

it.each([false, true])('releases a delayed older pack without regressing the peer base (reopen=%s)', async (reopen) => {
  sqlite.prepare("UPDATE nodes SET current_version_id = 'B'").run();
  await stageOutboundNodeVersionHolds(port, { createdAt: 'now', deviceId: 'remote', groupId: 'group',
    heads: [{ objectId: 'node', versionId: 'B' }], packId: 'pack-2' });
  sqlite.prepare("UPDATE nodes SET current_version_id = 'E'").run();
  await advanceInboundNodePeerBases(port, 'remote', [{ objectId: 'node', versionId: 'C' }]);
  if (reopen) {
    sqlite.close();
    open();
  }
  await confirmOutboundNodeVersionPack(port, {
    confirmedAt: 'later', deviceId: 'remote', groupId: 'group', libraryEpoch: 'epoch',
    packId: 'pack-2', proofRevision: 2,
    results: [{ baseVersionId: 'B', objectId: 'node', result: 'applied', sentVersionId: 'B' }]
  });
  expect(base()).toMatchObject({ version_id: 'C', library_epoch: 'epoch' });
  expect(sqlite.prepare('SELECT * FROM node_version_outbound_holds').all()).toEqual([]);
  expect(sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'C' }, { version_id: 'E' }]);
});

it.each(['unknown', 'left', 'blocked', 'self', 'missing-base'])('does not advance an unqualified peer (%s)', async (condition) => {
  let peerId = 'remote';
  if (condition === 'unknown') peerId = 'unknown';
  if (condition === 'left') sqlite.exec("UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = 'remote'");
  if (condition === 'blocked') sqlite.exec("UPDATE node_version_device_revisions SET blocked_reason = 'invalid'");
  if (condition === 'self') sqlite.exec("UPDATE sync_group_local_state SET local_device_identity_key = 'remote'");
  if (condition === 'missing-base') sqlite.exec('DELETE FROM node_version_device_bases');
  const before = base();
  await advanceInboundNodePeerBases(port, peerId, [{ objectId: 'node', versionId: 'C' }]);
  expect(base()).toEqual(before);
});

it('does not move an existing base backwards or across object boundaries', async () => {
  await advanceInboundNodePeerBases(port, 'remote', [{ objectId: 'node', versionId: 'C' }]);
  await advanceInboundNodePeerBases(port, 'remote', [
    { objectId: 'node', versionId: 'A' }, { objectId: 'other', versionId: 'E' }
  ]);
  expect(base()).toMatchObject({ version_id: 'C' });
});

// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { confirmOutboundNodeVersionPack } from '../../lib/core/sync/nodeVersionDeliveryProof.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';

it('holds the exact sent head and full payloads before publishing a desktop pack', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-version-holds-'));
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.exec(`
      INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
        VALUES ('group', 'Group', 'key', 'now', 'now');
      INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now');
      INSERT INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
         platform, state, joined_at, updated_at)
        VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now'),
          ('group', 'target', 'target-anchor', '/target', 'Target', 'android', 'active', 'now', 'now');
      INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
        VALUES ('node', 'topic', 'Node', 'B', 'now', 'now');
      INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
        VALUES ('A', 'node', NULL, 'source', 'before', 'hash-a', 'body-a', '{"id":"node","content":"body-a"}'),
          ('B', 'node', 'A', 'source', 'now', 'hash-b', 'body-b', '{"id":"node","content":"body-b"}');
      INSERT INTO node_sync_version_parents VALUES ('B', 'A', 0);
      INSERT INTO sync_object_state
        (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
        VALUES ('node', 'node', 1, 'hash-b', 'source', 'now');
    `);
    await buildDesktopSyncPackFromDriver({
      fromPeerId: 'source', fromStateSeq: 0, outputPath: path.join(root, 'pack.syncpack'),
      packId: 'pack', requireDeliveryHold: true, toPeerId: 'target'
    }, createBetterSqlite3Driver(sqlite));

    expect(sqlite.prepare('SELECT object_id, version_id FROM node_version_outbound_holds').all())
      .toEqual([{ object_id: 'node', version_id: 'B' }]);
    expect(sqlite.prepare('SELECT version_id FROM node_version_outbound_payload_holds ORDER BY version_id').all())
      .toEqual([{ version_id: 'A' }, { version_id: 'B' }]);
  } finally {
    sqlite.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('keeps unconfirmed pack payloads across a database restart and releases them after exact receipt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-version-restart-'));
  const databasePath = path.join(root, 'library.db');
  let sqlite = new Database(databasePath);
  try {
    seedRestartLibrary(sqlite);
    await buildDesktopSyncPackFromDriver({
      fromPeerId: 'source', fromStateSeq: 0, outputPath: path.join(root, 'pack.syncpack'),
      packId: 'pack', requireDeliveryHold: true, toPeerId: 'target'
    }, createBetterSqlite3Driver(sqlite));
    sqlite.exec(`
      INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at,
         content_hash, body_text, snapshot_json)
        VALUES ('D', 'node', 'C', 'source', '4', 'hash-d', 'body-d', '{"content":"body-d"}');
      INSERT INTO node_sync_version_parents VALUES ('D', 'C', 0);
      UPDATE nodes SET current_version_id = 'D' WHERE id = 'node';
      UPDATE sync_object_state SET current_version_id = 'D', state_seq = 2 WHERE object_id = 'node';
    `);
    sqlite.close();
    sqlite = new Database(databasePath);
    const port = createBetterSqliteDbPort(sqlite);
    expect(sqlite.prepare(`SELECT version_id FROM node_version_outbound_payload_holds
      WHERE pack_id = 'pack' ORDER BY version_id`).all())
      .toEqual([{ version_id: 'A' }, { version_id: 'B' }, { version_id: 'C' }]);
    expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
    await confirmOutboundNodeVersionPack(port, {
      confirmedAt: 'later', deviceId: 'target', groupId: 'group', libraryEpoch: 'epoch',
      packId: 'pack', proofRevision: 2,
      results: [{ baseVersionId: 'C', objectId: 'node', result: 'applied', sentVersionId: 'C' }]
    });
    // Confirmation already collects the chain; repeating collection is idempotent.
    expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
    expect(sqlite.prepare(`SELECT version_id FROM node_sync_versions ORDER BY version_id`).all())
      .toEqual(['A', 'B', 'C', 'D'].map((version_id) => ({ version_id })));
  } finally {
    sqlite.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function seedRestartLibrary(sqlite: Database.Database) {
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`
    INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'source', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
       platform, state, joined_at, updated_at)
      VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now'),
        ('group', 'target', 'target-anchor', '/target', 'Target', 'android', 'active', 'now', 'now');
    INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES ('node', 'topic', 'Node', 'C', 'now', 'now');
    INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at,
       content_hash, body_text, snapshot_json)
      VALUES ('A', 'node', NULL, 'source', '1', 'hash-a', 'body-a', '{"content":"body-a"}'),
        ('B', 'node', 'A', 'source', '2', 'hash-b', 'body-b', '{"content":"body-b"}'),
        ('C', 'node', 'B', 'source', '3', 'hash-c', 'body-c', '{"content":"body-c"}');
    INSERT INTO node_sync_version_parents VALUES ('B', 'A', 0), ('C', 'B', 0);
    INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at)
      VALUES ('node', 'node', 1, 'C', 'hash-c', 'source', 'now');
    INSERT INTO node_version_device_revisions VALUES
      ('group', 'target', 'epoch', 1, 'old-pack', NULL, 'now');
    INSERT INTO node_version_device_bases VALUES
      ('group', 'target', 'node', 'A', 'epoch', 1, 'old-pack', 'now');
  `);
}

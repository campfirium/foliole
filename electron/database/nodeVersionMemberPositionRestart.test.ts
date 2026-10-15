// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { collectNodeVersionPayloads } from '../../lib/core/sync/nodeVersionPayloadCollector.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { receiveMemberPositionFixture } from './nodeVersionMemberPosition.testSupport.js';

it('retires unused topic bodies after restart independently of member positions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-version-restart-'));
  const databasePath = path.join(root, 'library.db');
  let sqlite = new Database(databasePath);
  try {
    seedRestartLibrary(sqlite);
    sqlite.exec(`
      INSERT INTO node_sync_versions
        (version_id, object_id, parent_version_id, host_name, created_at,
         content_hash, body_text, snapshot_json)
        VALUES ('D', 'node', 'C', 'source', '4', 'hash-d', 'body-d', '{"id":"node","kind":"topic","content":"body-d"}');
      INSERT INTO node_sync_version_parents VALUES ('D', 'C', 0);
      UPDATE nodes SET current_version_id = 'D' WHERE id = 'node';
      UPDATE sync_object_state SET current_version_id = 'D', state_seq = 2 WHERE object_id = 'node';
    `);
    sqlite.close();
    sqlite = new Database(databasePath);
    const port = createBetterSqliteDbPort(sqlite);
    const parents = sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
    expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 3, skipped: null });
    await receiveMemberPositionFixture(port, { group_id: 'group', device_identity_key: 'target',
      object_id: 'node', library_epoch: 'epoch', proof_revision: 2, adopted_version_id: 'C',
      pending_version_ids_json: '[]', updated_at: 'later' });
    expect(await collectNodeVersionPayloads(port, 'node')).toEqual({ released: 0, skipped: null });
    expect(sqlite.prepare('SELECT version_id, body_text FROM node_sync_versions ORDER BY version_id').all())
      .toEqual([{ version_id: 'A', body_text: null }, { version_id: 'B', body_text: null },
        { version_id: 'C', body_text: null }, { version_id: 'D', body_text: 'body-d' }]);
    expect(sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(parents);
    expect(sqlite.prepare("SELECT adopted_version_id FROM node_version_member_positions WHERE device_identity_key = 'target'").pluck().get()).toBe('C');
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
      VALUES ('A', 'node', NULL, 'source', '1', 'hash-a', 'body-a', '{"id":"node","kind":"topic","content":"body-a"}'),
        ('B', 'node', 'A', 'source', '2', 'hash-b', 'body-b', '{"id":"node","kind":"topic","content":"body-b"}'),
        ('C', 'node', 'B', 'source', '3', 'hash-c', 'body-c', '{"id":"node","kind":"topic","content":"body-c"}');
    INSERT INTO node_sync_version_parents VALUES ('B', 'A', 0), ('C', 'B', 0);
    INSERT INTO sync_object_state
      (object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at)
      VALUES ('node', 'node', 1, 'C', 'hash-c', 'source', 'now');
    INSERT INTO node_version_device_revisions VALUES
      ('group', 'target', 'epoch', 1, 'old-pack', NULL, 'now');
  `);
}

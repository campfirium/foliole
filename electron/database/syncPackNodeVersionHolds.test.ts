// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
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

import Database from 'better-sqlite3';
import { afterEach, beforeEach } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export let sqlite: Database.Database;
export let port: DbPort;

export function setupVersionCollectionFixture() {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    initializeDatabaseSchema(sqlite);
    port = createBetterSqliteDbPort(sqlite);
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
    `);
    for (const [index, id] of ['A', 'B', 'C', 'D', 'E'].entries()) {
      const parent = index ? ['A', 'B', 'C', 'D'][index - 1] : null;
      sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, 'node', ?, 'local', ?, ?, ?, ?)`).run(
      id, parent, `2026-09-27T00:00:0${index}Z`, `hash-${id}`, `body-${id}`,
      JSON.stringify({ id: 'node', content: `body-${id}` })
      );
      sqlite.prepare('INSERT INTO node_version_local_origins VALUES (?)').run(id);
      if (parent) sqlite.prepare(`INSERT INTO node_sync_version_parents VALUES (?, ?, 0)`).run(id, parent);
    }
  });

  afterEach(() => sqlite.close());
}

export function proveBase(versionId: string) {
  sqlite.prepare(`INSERT OR IGNORE INTO node_version_device_revisions VALUES
    ('group', 'remote', 'epoch', 1, 'pack-1', NULL, 'now')`).run();
  sqlite.prepare(`INSERT INTO node_version_device_bases VALUES
    ('group', 'remote', 'node', ?, 'epoch', 1, 'pack-1', 'now')`).run(versionId);
}

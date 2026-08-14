import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { DESKTOP_CORE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopCoreSchemaStatements.js';
import { DESKTOP_RESOURCE_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopResourceSchemaStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';
import { SYNC_SCHEMA_STATEMENTS } from '../../lib/core/database/syncSchemaStatements.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { rekeyLocalSyncHistory } from './syncGroupLocalIdentityRekey.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const statement of [
    ...DESKTOP_CORE_SCHEMA_STATEMENTS,
    ...DESKTOP_RESOURCE_SCHEMA_STATEMENTS,
    ...SYNC_SCHEMA_STATEMENTS,
    ...SYNC_GROUP_SCHEMA_STATEMENTS
  ]) sqlite.exec(statement);
  seedLocalHistory();
});

afterEach(() => sqlite.close());

it('atomically rekeys existing local history to the approved group identity', () => {
  const driver = createBetterSqlite3Driver(sqlite);
  expect(rekeyLocalSyncHistory(driver, 'Maci', 'Maci 2')).toEqual({ rekeyedVersionCount: 2 });

  expect(sqlite.prepare('SELECT version_id, parent_version_id, device_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([
      { device_id: 'Maci 2', parent_version_id: null, version_id: 'Maci 2#0' },
      { device_id: 'Maci 2', parent_version_id: 'Maci 2#0', version_id: 'Maci 2#1' }
    ]);
  expect(sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').get())
    .toEqual({ parent_version_id: 'Maci 2#0', version_id: 'Maci 2#1' });
  expect(sqlite.prepare('SELECT current_version_id, last_modified_by_device_id FROM nodes WHERE id = ?').get('topic-b'))
    .toEqual({ current_version_id: 'Maci 2#1', last_modified_by_device_id: 'Maci 2' });
  expect(sqlite.prepare('SELECT current_version_id, last_modified_by_device_id FROM sync_object_state').get())
    .toEqual({ current_version_id: 'Maci 2#1', last_modified_by_device_id: 'Maci 2' });
  expect(sqlite.prepare('SELECT base_version_id, result_version_id, device_id FROM sync_change_log').get())
    .toEqual({ base_version_id: 'Maci 2#0', result_version_id: 'Maci 2#1', device_id: 'Maci 2' });
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci 2"');

  sqlite.prepare("UPDATE nodes SET content = 'next', sync_dirty = 1 WHERE id = 'topic-b'").run();
  expect(flushNodeSyncVersionWithDriver(driver, 'topic-b', 'Maci 2', '2026-08-14T03:00:00Z'))
    .toBe('Maci 2#2');
});

it('rolls back without changing old history when a target version id already exists', () => {
  sqlite.prepare(`INSERT INTO node_sync_versions (
    version_id, object_id, parent_version_id, device_id, created_at, content_hash, body_text, snapshot_json
  ) VALUES ('Maci 2#0', 'topic-b', NULL, 'Maci 2', '2026-08-14T02:00:00Z', 'other', 'other', '{}')`).run();
  const driver = createBetterSqlite3Driver(sqlite);

  expect(() => rekeyLocalSyncHistory(driver, 'Maci', 'Maci 2'))
    .toThrow('sync_group_local_identity_target_conflict:Maci 2#0');
  expect(sqlite.prepare("SELECT COUNT(*) FROM node_sync_versions WHERE device_id = 'Maci'").pluck().get()).toBe(2);
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci"');
});

function seedLocalHistory() {
  sqlite.exec(`
    INSERT INTO settings VALUES ('device_id', '"Maci"', '2026-08-14T01:00:00Z');
    INSERT INTO settings VALUES ('desktop_node_sync_version_counter', '2', '2026-08-14T01:00:00Z');
    INSERT INTO nodes (
      id, parent_id, kind, title, content, current_version_id, last_modified_by_device_id,
      created_at, updated_at
    ) VALUES ('topic-b', NULL, 'topic', 'B', 'body-b', 'Maci#1', 'Maci',
      '2026-08-14T01:00:00Z', '2026-08-14T01:00:00Z');
    INSERT INTO node_sync_versions VALUES
      ('Maci#0', 'topic-b', NULL, 'Maci', '2026-08-14T01:00:00Z', 'hash-0', 'body-0', '{}'),
      ('Maci#1', 'topic-b', 'Maci#0', 'Maci', '2026-08-14T01:01:00Z', 'hash-1', 'body-b', '{}');
    INSERT INTO node_sync_version_parents VALUES ('Maci#1', 'Maci#0', 0);
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_device_id, updated_at, sync_dirty
    ) VALUES ('node', 'topic-b', 1, 'Maci#1', 'hash-1', 'Maci', '2026-08-14T01:01:00Z', 1);
    INSERT INTO sync_change_log VALUES (
      'change-b', 'node', 'topic-b', 'update', 'Maci', 'Maci#0', 'Maci#1',
      'hash-1', '{}', '2026-08-14T01:01:00Z', NULL
    );
  `);
}

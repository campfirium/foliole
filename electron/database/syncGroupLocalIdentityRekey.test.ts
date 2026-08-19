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

it('keeps opaque references stable while rekeying frozen author attribution', () => {
  const driver = createBetterSqlite3Driver(sqlite);
  expect(rekeyLocalSyncHistory(driver, 'Maci', 'Maci 2')).toEqual({ rekeyedVersionCount: 0 });

  expect(sqlite.prepare('SELECT version_id, parent_version_id, device_id FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([
      { device_id: 'Maci 2', parent_version_id: null, version_id: 'ver_0' },
      { device_id: 'Maci 2', parent_version_id: 'ver_0', version_id: 'ver_1' }
    ]);
  expect(sqlite.prepare('SELECT version_id, parent_version_id FROM node_sync_version_parents').get())
    .toEqual({ parent_version_id: 'ver_0', version_id: 'ver_1' });
  expect(sqlite.prepare('SELECT current_version_id, last_modified_by_device_id FROM nodes WHERE id = ?').get('topic-b'))
    .toEqual({ current_version_id: 'ver_1', last_modified_by_device_id: 'Maci 2' });
  expect(sqlite.prepare('SELECT current_version_id, last_modified_by_device_id FROM sync_object_state').get())
    .toEqual({ current_version_id: 'ver_1', last_modified_by_device_id: 'Maci 2' });
  expect(sqlite.prepare('SELECT base_version_id, result_version_id, device_id FROM sync_change_log').get())
    .toEqual({ base_version_id: 'ver_0', result_version_id: 'ver_1', device_id: 'Maci 2' });
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci 2"');

  sqlite.prepare("UPDATE nodes SET content = 'next', sync_dirty = 1 WHERE id = 'topic-b'").run();
  expect(flushNodeSyncVersionWithDriver(driver, 'topic-b', 'Maci 2', '2026-08-14T03:00:00Z'))
    .toMatch(/^ver_[0-9a-f-]{36}$/);
});

it('rejects an invalid identity without changing opaque history', () => {
  const driver = createBetterSqlite3Driver(sqlite);

  expect(() => rekeyLocalSyncHistory(driver, 'Maci', ' ')).toThrow('sync_group_local_identity_invalid');
  expect(sqlite.prepare("SELECT COUNT(*) FROM node_sync_versions WHERE device_id = 'Maci'").pluck().get()).toBe(2);
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"Maci"');
});

function seedLocalHistory() {
  sqlite.exec(`
    INSERT INTO settings VALUES ('device_id', '"Maci"', '2026-08-14T01:00:00Z');
    INSERT INTO nodes (
      id, parent_id, kind, title, content, current_version_id, last_modified_by_device_id,
      created_at, updated_at
    ) VALUES ('topic-b', NULL, 'topic', 'B', 'body-b', 'ver_1', 'Maci',
      '2026-08-14T01:00:00Z', '2026-08-14T01:00:00Z');
    INSERT INTO node_sync_versions VALUES
      ('ver_0', 'topic-b', NULL, 'Maci', '2026-08-14T01:00:00Z', 'hash-0', 'body-0', '{}'),
      ('ver_1', 'topic-b', 'ver_0', 'Maci', '2026-08-14T01:01:00Z', 'hash-1', 'body-b', '{}');
    INSERT INTO node_sync_version_parents VALUES ('ver_1', 'ver_0', 0);
    INSERT INTO sync_object_state (
      object_type, object_id, state_seq, current_version_id, content_hash,
      last_modified_by_device_id, updated_at, sync_dirty
    ) VALUES ('node', 'topic-b', 1, 'ver_1', 'hash-1', 'Maci', '2026-08-14T01:01:00Z', 1);
    INSERT INTO sync_change_log VALUES (
      'change-b', 'node', 'topic-b', 'update', 'Maci', 'ver_0', 'ver_1',
      'hash-1', '{}', '2026-08-14T01:01:00Z', NULL
    );
  `);
}

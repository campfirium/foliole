// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

it('repairs deployed schema 88 databases missing the sync base hash column', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER NOT NULL,
      current_version_id TEXT,
      content_hash TEXT NOT NULL,
      last_modified_by_host_name TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_type, object_id),
      UNIQUE (state_seq)
    );
    INSERT INTO sync_object_state VALUES (
      'node', 'node-1', 1, NULL, 'hash-1', 'Mac', '2026-09-15T00:00:00.000Z', NULL, 0
    );
    PRAGMA user_version = 88;
  `);

  migrateNumberedFixtureTo(sqlite, 89);

  const columns = sqlite.prepare('PRAGMA table_info(sync_object_state)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toContain('base_content_hash');
  expect(sqlite.prepare(`SELECT object_id, content_hash, base_content_hash
    FROM sync_object_state`).get()).toEqual({
    base_content_hash: null,
    content_hash: 'hash-1',
    object_id: 'node-1'
  });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(89);
  sqlite.close();
});

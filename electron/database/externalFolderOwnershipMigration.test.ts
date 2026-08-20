// @vitest-environment node

import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

it('preserves legacy folder ids while allowing equal paths for different owners', () => {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(`CREATE TABLE external_search_folders (
    id TEXT PRIMARY KEY, folder_path TEXT NOT NULL UNIQUE, attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT, excluded_dirs_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0, indexed_at TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); INSERT INTO external_search_folders VALUES ('legacy', '/same', 'document_relative', NULL, '[]', 'ready', 3, NULL, NULL, 'now', 'now');
  PRAGMA user_version = 60;`);

  migrateNumberedFixtureTo(sqlite, 61);
  expect(sqlite.prepare('SELECT id, owner_installation_id FROM external_search_folders').get()).toEqual({
    id: 'legacy', owner_installation_id: null
  });
  sqlite.prepare(`INSERT INTO external_search_folders (
    id, folder_path, attachment_mode, owner_installation_id, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`)
    .run('a', '/same', 'document_relative', 'owner-a', 'now', 'now',
      'b', '/same', 'document_relative', 'owner-b', 'now', 'now');
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM external_search_folders').get()).toEqual({ count: 3 });
  sqlite.close();
});

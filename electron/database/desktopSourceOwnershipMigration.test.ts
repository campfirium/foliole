// @vitest-environment node

import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

it('adds Source execution ownership without guessing ambiguous Watched ownership', () => {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.exec(`CREATE TABLE desktop_sources (
    source_ref TEXT PRIMARY KEY, source_type TEXT NOT NULL, config_ref TEXT NOT NULL,
    host_name TEXT NOT NULL, host_platform TEXT NOT NULL, root_path TEXT NOT NULL,
    path_flavor TEXT NOT NULL, type_settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (source_type, config_ref)
  );
  CREATE TABLE external_search_folders (
    id TEXT PRIMARY KEY, source_ref TEXT, owner_installation_id TEXT
  );
  INSERT INTO desktop_sources VALUES
    ('external:a', 'external', 'a', 'Same Host', 'darwin', '/External', 'posix', '{}', 'now', 'now'),
    ('watched:b', 'watched', 'b', 'Same Host', 'darwin', '/Watched', 'posix', '{}', 'now', 'now');
  INSERT INTO external_search_folders VALUES ('a', 'external:a', 'installation-a');
  PRAGMA user_version = 68;`);

  migrateNumberedFixtureTo(sqlite, 69);

  expect(sqlite.prepare(`SELECT source_ref, owner_installation_id, root_path FROM desktop_sources
    ORDER BY source_ref`).all()).toEqual([
    { owner_installation_id: 'installation-a', root_path: '/External', source_ref: 'external:a' },
    { owner_installation_id: null, root_path: '/Watched', source_ref: 'watched:b' }
  ]);
  expect(sqlite.pragma('user_version', { simple: true })).toBe(69);
  sqlite.close();
});

// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
});

afterEach(() => sqlite.close());

it('adds durable removal decisions and confirmations when schema 90 upgrades', () => {
  sqlite.exec(`DROP TABLE sync_group_removal_confirmations;
    DROP TABLE sync_group_removal_decisions;
    PRAGMA user_version = 90;`);

  initializeDatabaseSchema(sqlite);

  const tables = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'sync_group_removal_%' ORDER BY name`).pluck().all();
  expect(tables).toEqual(['sync_group_removal_confirmations', 'sync_group_removal_decisions']);
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

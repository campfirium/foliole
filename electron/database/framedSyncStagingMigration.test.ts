// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';

const EXPECTED_STAGING_TABLES = [
  'framed_sync_fact_summary',
  'framed_sync_inventory',
  'framed_sync_node_digest',
  'framed_sync_resource_availability',
  'framed_sync_version_summary'
] as const;

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
});

afterEach(() => sqlite.close());

it('keeps reconciliation indexes without transport staging in a fresh production database', () => {
  initializeDatabaseSchema(sqlite);

  expect(readStagingTables()).toEqual(EXPECTED_STAGING_TABLES.map((name) => ({ name })));
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('upgrades the prior production schema without changing business rows and remains idempotent', () => {
  initializeDatabaseSchema(sqlite);
  const currentFlow = readFlowSignature();
  restoreEmptyLegacyDailyFlowSchema(sqlite);
  sqlite.prepare(`INSERT INTO nodes
    (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run('existing-node', 'Existing', 'Preserved body', '2026-10-05T00:00:00.000Z',
    '2026-10-05T00:00:00.000Z');
  sqlite.prepare('INSERT INTO workspace_meta (key, value, updated_at) VALUES (?, ?, ?)')
    .run('existing-setting', 'preserved-value', '2026-10-05T00:00:00.000Z');
  removeStagingTables();
  const businessSchema = readBusinessSchema();
  sqlite.pragma('user_version = 137');

  initializeDatabaseSchema(sqlite);

  const businessRow = sqlite.prepare(
    'SELECT id, title, content, created_at, updated_at FROM nodes WHERE id = ?'
  ).get('existing-node');
  const installedSchema = readStagingSchema();
  expect(businessRow).toEqual({
    content: 'Preserved body',
    created_at: '2026-10-05T00:00:00.000Z',
    id: 'existing-node',
    title: 'Existing',
    updated_at: '2026-10-05T00:00:00.000Z'
  });
  expect(readStagingTables()).toEqual(EXPECTED_STAGING_TABLES.map((name) => ({ name })));
  expect(readBusinessSchema()).toEqual(businessSchema);
  expect(readFlowSignature()).toEqual(currentFlow);
  expect(sqlite.prepare('SELECT key, value, updated_at FROM workspace_meta WHERE key = ?')
    .get('existing-setting')).toEqual({
    key: 'existing-setting', updated_at: '2026-10-05T00:00:00.000Z', value: 'preserved-value'
  });
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);

  initializeDatabaseSchema(sqlite);

  expect(readStagingSchema()).toEqual(installedSchema);
  expect(sqlite.prepare('SELECT id, title, content FROM nodes WHERE id = ?').get('existing-node'))
    .toEqual({ content: 'Preserved body', id: 'existing-node', title: 'Existing' });
});

function readStagingTables() {
  return sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'framed_sync_%' ORDER BY name`).all();
}

function readStagingSchema() {
  return sqlite.prepare(`SELECT name, sql FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'framed_sync_%' ORDER BY name`).all();
}

function readBusinessSchema() {
  return sqlite.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE name NOT LIKE 'framed_sync_%' AND tbl_name NOT LIKE 'framed_sync_%'
      AND tbl_name NOT IN ('daily_flow_entries', 'daily_flow_operations')
    ORDER BY type, name`).all();
}

function readFlowSignature() {
  const tables = ['daily_flow_state', 'daily_flow_entries', 'daily_flow_operations'];
  return {
    columns: tables.map(table => sqlite.prepare('SELECT * FROM pragma_table_info(?) ORDER BY cid').all(table)),
    indexes: sqlite.prepare(`SELECT name, tbl_name, sql FROM sqlite_master
      WHERE type = 'index' AND sql IS NOT NULL AND tbl_name IN (SELECT value FROM json_each(?))
      ORDER BY name`).all(JSON.stringify(tables))
  };
}

function removeStagingTables() {
  sqlite.pragma('foreign_keys = OFF');
  for (const name of [...EXPECTED_STAGING_TABLES].reverse()) {
    sqlite.exec(`DROP TABLE ${name}`);
  }
  sqlite.pragma('foreign_keys = ON');
}

// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

const EXPECTED_STAGING_TABLES = [
  'framed_sync_available_blobs',
  'framed_sync_available_resources',
  'framed_sync_blob_chunks',
  'framed_sync_blob_offers',
  'framed_sync_blob_pins',
  'framed_sync_completion_windows',
  'framed_sync_fact_summary',
  'framed_sync_inbound_attempts',
  'framed_sync_inbound_facts',
  'framed_sync_inbound_frames',
  'framed_sync_inbound_transfers',
  'framed_sync_inventory',
  'framed_sync_outbound_attempts',
  'framed_sync_outbound_blob_refs',
  'framed_sync_outbound_fact_refs',
  'framed_sync_outbound_frames',
  'framed_sync_outbound_holds',
  'framed_sync_outbound_publications',
  'framed_sync_receipts',
  'framed_sync_resource_availability',
  'framed_sync_resource_blob_chunks',
  'framed_sync_resource_demands',
  'framed_sync_resource_pins',
  'framed_sync_session_send_states',
  'framed_sync_termination_acks',
  'framed_sync_termination_requests',
  'framed_sync_version_summary'
] as const;

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
});

afterEach(() => sqlite.close());

it('installs framed sync staging in a fresh production database', () => {
  initializeDatabaseSchema(sqlite);

  expect(readStagingTables()).toEqual(EXPECTED_STAGING_TABLES.map((name) => ({ name })));
  expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('upgrades the prior production schema without changing business rows and remains idempotent', () => {
  initializeDatabaseSchema(sqlite);
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
    ORDER BY type, name`).all();
}

function removeStagingTables() {
  sqlite.pragma('foreign_keys = OFF');
  for (const name of [...EXPECTED_STAGING_TABLES].reverse()) {
    sqlite.exec(`DROP TABLE ${name}`);
  }
  sqlite.pragma('foreign_keys = ON');
}

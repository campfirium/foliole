// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const TABLES = ['node_version_device_bases', 'node_version_device_revisions',
  'node_version_outbound_holds', 'node_version_outbound_payload_holds', 'node_version_local_holds',
  'node_version_pack_receipts', 'node_version_local_proof_state', 'node_version_inbound_receipts',
  'node_version_local_source_revisions'];

function dropRetentionTables(sqlite: Database.Database) {
  for (const name of TABLES) sqlite.exec(`DROP TABLE ${name}`);
}

function expectTables(sqlite: Database.Database) {
  const names = sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
    AND name LIKE 'node_version_%' ORDER BY name`).all() as Array<{ name: string }>;
  expect(names.map((row) => row.name)).toEqual([...TABLES].sort());
}

it('adds retention state and a stable library epoch without touching desktop versions', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    sqlite.exec(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES ('node', 'topic', 'Node', 'original', 'now', 'now');
      INSERT INTO node_sync_versions
        (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES ('original', 'node', 'local', 'now', 'hash', 'original body', '{"content":"original body"}');`);
    dropRetentionTables(sqlite);
    sqlite.pragma('user_version = 105');

    initializeDatabaseSchema(sqlite);

    expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expectTables(sqlite);
    expect(sqlite.prepare('SELECT library_epoch, proof_revision FROM node_version_local_proof_state').get())
      .toMatchObject({ library_epoch: expect.any(String), proof_revision: 0 });
    expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get('original'))
      .toEqual({ body_text: 'original body' });
  } finally {
    sqlite.close();
  }
});

it('adds retention state and a stable library epoch to an existing companion library', async () => {
  const sqlite = new Database(':memory:');
  try {
    for (const statement of COMPANION_SCHEMA_STATEMENTS) sqlite.exec(statement);
    dropRetentionTables(sqlite);
    sqlite.pragma('user_version = 40');

    await migrateCompanionDatabase(createBetterSqliteDbPort(sqlite), 40, COMPANION_DATABASE_VERSION);

    expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
    expectTables(sqlite);
    expect(sqlite.prepare('SELECT library_epoch, proof_revision FROM node_version_local_proof_state').get())
      .toMatchObject({ library_epoch: expect.any(String), proof_revision: 0 });
  } finally {
    sqlite.close();
  }
});

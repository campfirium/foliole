// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function dropDailyState(sqlite: Database.Database, version: number) {
  const triggers = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'daily_flow_%'").all() as { name: string }[];
  for (const trigger of triggers) sqlite.exec(`DROP TRIGGER ${trigger.name}`);
  for (const name of ['daily_flow_state', 'daily_flow_entries', 'daily_flow_operations',
    'daily_flow_sync_facts', 'daily_flow_sync_projection']) sqlite.exec(`DROP TABLE ${name}`);
  sqlite.pragma(`user_version = ${version}`);
}
function seed(sqlite: Database.Database) {
  sqlite.prepare("INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES ('original','Keep me','Original body','2026-01-01','2026-01-01')").run();
  return sqlite.prepare("SELECT * FROM nodes WHERE id='original'").get();
}
function assertLazyAndPreserved(sqlite: Database.Database, original: unknown) {
  expect(sqlite.prepare("SELECT * FROM nodes WHERE id='original'").get()).toEqual(original);
  expect(sqlite.prepare('SELECT * FROM daily_flow_state').all()).toEqual([]);
  expect(sqlite.prepare('SELECT * FROM daily_flow_entries').all()).toEqual([]);
}

it('upgrades desktop 174 transactionally and leaves original node facts untouched', () => {
  const sqlite = new Database(':memory:');
  try {
    initializeDatabaseSchema(sqlite);
    seed(sqlite);
    sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id,object_id,host_name,created_at,content_hash,body_text,snapshot_json)
      VALUES ('original-version','original','fixture','2026-01-01',?,?,?)`)
      .run(hashTextBody('Original body'), 'Original body', JSON.stringify({ content: 'Original body', body_blob_hash: null }));
    sqlite.prepare("UPDATE nodes SET current_version_id='original-version' WHERE id='original'").run();
    const original = sqlite.prepare("SELECT * FROM nodes WHERE id='original'").get() as Record<string, unknown>;
    const versions = sqlite.prepare('SELECT * FROM node_sync_versions').all();
    dropDailyState(sqlite, 174);
    expect(() => initializeDatabaseSchema(sqlite, { beforeVersionCommit: () => { throw new Error('interrupted'); } })).toThrow('interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(174);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='daily_flow_state'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT * FROM nodes WHERE id='original'").get()).toEqual(original);
    expect(sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
    initializeDatabaseSchema(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
    expect(sqlite.prepare('SELECT * FROM daily_flow_sync_facts').all()).toEqual([]);
    assertLazyAndPreserved(sqlite, { ...original, body_blob_hash: hashTextBody('Original body') });
    expect(sqlite.prepare('SELECT * FROM node_sync_versions').all()).toEqual(versions);
  } finally { sqlite.close(); }
});

it('installs companion Flow synchronization atomically from version 104 without changing original facts', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    const original = seed(sqlite);
    sqlite.exec('DROP TABLE daily_flow_sync_facts; DROP TABLE daily_flow_sync_projection; PRAGMA user_version=104');
    const db = createBetterSqliteDbPort(sqlite);
    await expect(db.transaction(tx => migrateCompanionDatabase(tx, 104, 105,
      async () => { throw new Error('interrupted'); }))).rejects.toThrow('interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(104);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='daily_flow_sync_facts'").get()).toBeUndefined();
    await db.transaction(tx => migrateCompanionDatabase(tx, 104, 105));
    expect(sqlite.pragma('user_version', { simple: true })).toBe(105);
    expect(sqlite.prepare('SELECT * FROM daily_flow_sync_facts').all()).toEqual([]);
    assertLazyAndPreserved(sqlite, original);
  } finally { sqlite.close(); }
});

it('upgrades companion 101 through the production DbPort transaction without changing original facts', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    const original = seed(sqlite);
    dropDailyState(sqlite, 101);
    const db = createBetterSqliteDbPort(sqlite);
    await expect(db.transaction(tx => migrateCompanionDatabase(tx, 101, 102, async () => { throw new Error('interrupted'); }))).rejects.toThrow('interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(101);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='daily_flow_state'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT * FROM nodes WHERE id='original'").get()).toEqual(original);
    await db.transaction(tx => migrateCompanionDatabase(tx, 101, 102));
    expect(sqlite.pragma('user_version', { simple: true })).toBe(102);
    assertLazyAndPreserved(sqlite, original);
  } finally { sqlite.close(); }
});

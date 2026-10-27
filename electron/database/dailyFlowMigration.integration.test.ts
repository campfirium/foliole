// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function dropDailyState(sqlite: Database.Database, version: number) {
  const triggers = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'daily_flow_%'").all() as { name: string }[];
  for (const trigger of triggers) sqlite.exec(`DROP TRIGGER ${trigger.name}`);
  for (const name of ['daily_flow_state', 'daily_flow_entries', 'daily_flow_operations']) sqlite.exec(`DROP TABLE ${name}`);
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
    const original = seed(sqlite);
    dropDailyState(sqlite, 174);
    expect(() => initializeDatabaseSchema(sqlite, { beforeVersionCommit: () => { throw new Error('interrupted'); } })).toThrow('interrupted');
    expect(sqlite.pragma('user_version', { simple: true })).toBe(174);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='daily_flow_state'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT * FROM nodes WHERE id='original'").get()).toEqual(original);
    initializeDatabaseSchema(sqlite);
    expect(sqlite.pragma('user_version', { simple: true })).toBe(176);
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

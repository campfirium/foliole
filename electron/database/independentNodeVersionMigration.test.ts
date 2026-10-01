// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function oldDatabase(host: string) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = host === 'desktop' ? DESKTOP_FRESH_SCHEMA_STATEMENTS : COMPANION_SCHEMA_STATEMENTS;
  for (const statement of schema) db.exec(
    /CREATE TABLE IF NOT EXISTS node_sync_(versions|conflicts) \(/.test(statement)
      ? statement.replace('object_id TEXT NOT NULL', 'object_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE')
      : statement);
  db.pragma(`user_version = ${host === 'desktop' ? 121 : 58}`);
  db.exec(`INSERT INTO nodes (id, kind, title, created_at, updated_at, current_version_id)
      VALUES ('node', 'topic', 'Node', 'now', 'now', 'head');
    INSERT INTO node_sync_versions VALUES
      ('base', 'node', NULL, 'local', '1', 'hash1', 'base', '{"content":"base"}'),
      ('head', 'node', 'base', 'local', '2', 'hash2', 'head', '{"content":"head"}');
    INSERT INTO node_sync_version_parents VALUES ('head', 'base', 0);
    INSERT INTO node_version_local_origins VALUES ('base'), ('head');
    INSERT INTO node_sync_conflicts (conflict_version_id, object_id, parent_version_id, snapshot_json, detected_at)
      VALUES ('head', 'node', 'base', '{}', 'now');`);
  return db;
}

function protectedFacts(db: Database.Database) {
  return ['node_sync_versions', 'node_sync_version_parents', 'node_version_local_origins', 'node_sync_conflicts']
    .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

async function upgrade(db: Database.Database, host: string, fail = false) {
  const beforeCommit = () => { if (fail) throw new Error('injected_before_commit'); };
  if (host === 'desktop') initializeDatabaseSchema(db, { beforeVersionCommit: beforeCommit });
  else {
    const port = createBetterSqliteDbPort(db);
    const version = db.pragma('user_version', { simple: true }) as number;
    await port.transaction(tx => migrateCompanionDatabase(tx, version, 59, beforeCommit));
  }
}

it.each(['desktop', 'companion'])('upgrades the previous schema with FK enabled and preserves all dependent facts (%s)', async host => {
  const db = oldDatabase(host);
  try {
    const before = protectedFacts(db);
    await upgrade(db, host);
    expect(protectedFacts(db)).toEqual(before);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_list(node_sync_versions)')).toEqual([]);
    expect(db.pragma('foreign_key_list(node_sync_conflicts)')).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    db.exec("DELETE FROM nodes WHERE id = 'node'");
    expect(protectedFacts(db)).toEqual(before);
    await upgrade(db, host);
    expect(protectedFacts(db)).toEqual(before);
    expect(db.prepare("SELECT name FROM sqlite_temp_master WHERE name LIKE 's278_%'").all()).toEqual([]);
  } finally { db.close(); }
});

it.each(['desktop', 'companion'])('rolls back table reconstruction, facts and schema version on failure (%s)', async host => {
  const db = oldDatabase(host);
  try {
    const before = protectedFacts(db);
    const schema = db.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all();
    await expect(upgrade(db, host, true)).rejects.toThrow('injected_before_commit');
    expect(protectedFacts(db)).toEqual(before);
    expect(db.prepare("SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()).toEqual(schema);
    expect(db.pragma('user_version', { simple: true })).toBe(host === 'desktop' ? 121 : 58);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    await upgrade(db, host);
    expect(protectedFacts(db)).toEqual(before);
  } finally { db.close(); }
});

// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

function oldChain(db: Database.Database, group: boolean) {
  db.exec(`INSERT INTO nodes (id, kind, title, current_version_id, sync_dirty, created_at, updated_at)
    VALUES ('node', 'topic', 'Node', 'head', 0, 'now', 'now');
    INSERT INTO node_sync_versions VALUES
      ('base', 'node', NULL, 'local', '1', 'base-hash', 'base', '{"content":"base"}'),
      ('shell', 'node', 'base', 'local', '2', 'shell-hash', NULL, '{"content":null}'),
      ('head', 'node', 'shell', 'local', '3', 'head-hash', 'current', '{"content":"current"}');
    INSERT INTO node_sync_version_parents VALUES ('shell', 'base', 0), ('head', 'shell', 0);`);
  if (group) db.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'local', 'active', 'now');
    INSERT INTO sync_group_devices
      (group_id, device_identity_key, device_anchor, canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES ('group', 'peer', 'anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now');
    INSERT INTO node_version_device_bases VALUES ('group', 'peer', 'node', 'base', 'epoch', 1, 'sent', 'now');`);
  db.exec('DROP TABLE node_version_local_origins');
}

function expectChain(db: Database.Database, group: boolean) {
  expect(db.prepare('SELECT version_id, body_text, parent_version_id FROM node_sync_versions ORDER BY created_at').all())
    .toEqual(group ? [
      { version_id: 'base', body_text: 'base', parent_version_id: null },
      { version_id: 'head', body_text: 'current', parent_version_id: 'base' }
    ] : [{ version_id: 'head', body_text: 'current', parent_version_id: null }]);
  expect(db.pragma('foreign_key_check')).toEqual([]);
}

it.each([false, true])('upgrades desktop history and old empty shells once (group=%s)', (group) => {
  const db = new Database(':memory:');
  try {
    initializeDatabaseSchema(db);
    db.exec("INSERT INTO settings VALUES ('host_name', '\"local\"', 'now')");
    oldChain(db, group);
    db.pragma('user_version = 119');
    initializeDatabaseSchema(db);
    expectChain(db, group);
    initializeDatabaseSchema(db);
    expectChain(db, group);
  } finally { db.close(); }
});

it.each([false, true])('upgrades companion history with the same complete chain result (group=%s)', async (group) => {
  const db = new Database(':memory:');
  try {
    db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    db.exec("INSERT INTO companion_meta VALUES ('host_name', 'local', 'now')");
    oldChain(db, group);
    await migrateCompanionDatabase(createBetterSqliteDbPort(db), 56, 57);
    expectChain(db, group);
  } finally { db.close(); }
});

it.each(['desktop', 'companion'])('retires unproven legacy history even with an unknown peer (%s)', async (host) => {
  const db = new Database(':memory:');
  try {
    if (host === 'desktop') initializeDatabaseSchema(db);
    else db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    oldChain(db, true);
    db.exec("DELETE FROM node_version_device_bases; UPDATE node_sync_versions SET host_name = 'old-other-host'");
    if (host === 'desktop') {
      db.pragma('user_version = 119');
      initializeDatabaseSchema(db);
    } else await migrateCompanionDatabase(createBetterSqliteDbPort(db), 56, 57);
    expectChain(db, false);
  } finally { db.close(); }
});

it.each(['desktop', 'companion'])('retires an unused broken legacy chain while keeping current content (%s)', async (host) => {
  const db = new Database(':memory:');
  try {
    if (host === 'desktop') initializeDatabaseSchema(db);
    else db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    oldChain(db, false);
    db.exec("UPDATE node_sync_versions SET parent_version_id = 'missing-legacy' WHERE version_id = 'base'");
    if (host === 'desktop') {
      db.pragma('user_version = 119');
      initializeDatabaseSchema(db);
    } else await migrateCompanionDatabase(createBetterSqliteDbPort(db), 56, 57);
    expectChain(db, false);
  } finally { db.close(); }
});

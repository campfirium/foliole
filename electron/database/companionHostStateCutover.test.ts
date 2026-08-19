import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapCompanionDatabase } from '../../lib/core/database/companionDatabaseLifecycle.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let sqlite: Database.Database;
const roots: string[] = [];

afterEach(() => {
  sqlite?.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function legacyFixture() {
  const root = fs.mkdtempSync(path.resolve('.tmp/artifacts/t135-host-cutover-'));
  roots.push(root);
  sqlite = new Database(path.join(root, 'companion.db'));
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  sqlite.exec(`
    ALTER TABLE node_reading_host_state RENAME TO node_reading_device_state;
    ALTER TABLE node_reading_device_state RENAME COLUMN host_name TO device_id;
    ALTER TABLE node_view_state RENAME COLUMN host_name TO device_id;
    ALTER TABLE setting_records RENAME COLUMN host_name TO device_id;
    DROP INDEX IF EXISTS idx_setting_records_host;
    CREATE INDEX idx_setting_records_device ON setting_records (device_id, updated_at);
    INSERT INTO companion_meta VALUES ('device_id', 'Old Phone', 'old');
    INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('n', 'Node', 'old', 'old');
    INSERT INTO node_reading_device_state VALUES ('n', 'Old Phone', 22, 'old');
    INSERT INTO node_view_state VALUES ('n', 'Old Phone', 80, 1, 3, 'close-flush', 'old');
    INSERT INTO setting_records VALUES
      ('window_state','device','ios','phone','Old Phone','{"page":"article"}','old-hash','old',NULL);
    INSERT INTO workspace_meta VALUES ('active_node_id', 'n', 'old');
    INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES
      ('setting','device:ios:phone:Old Phone:window_state',1,'old-hash','Old Phone','old',0),
      ('view_state','session_resume:ios:phone:Old Phone:node:n',2,'old-view','Old Phone','old',0),
      ('view_state','session_resume:ios:phone:Other Phone:node:n',3,'other-view','Old Phone','old',0);
    PRAGMA user_version = 26;
  `);
  return createBetterSqliteDbPort(sqlite);
}

describe.each(['android', 'ios'] as const)('%s companion Host cutover', () => {
  it('transfers a copied v26 database to its current Host without rewriting execution identity', async () => {
    const port = legacyFixture();

    const result = await bootstrapCompanionDatabase(port, {
      allowCreate: false, expectedHostName: 'New Phone', now: 'new'
    });

    expect(result).toMatchObject({ deviceId: 'Old Phone', hostName: 'New Phone', version: COMPANION_DATABASE_VERSION });
    expect(sqlite.prepare('SELECT host_name, reading_position FROM node_reading_host_state').get())
      .toEqual({ host_name: 'New Phone', reading_position: 22 });
    expect(sqlite.prepare('SELECT host_name, scroll_top, selection_from, selection_to FROM node_view_state').get())
      .toEqual({ host_name: 'New Phone', scroll_top: 80, selection_from: 1, selection_to: 3 });
    expect(sqlite.prepare('SELECT scope, host_name, value_json FROM setting_records').get())
      .toEqual({ scope: 'host', host_name: 'New Phone', value_json: '{"page":"article"}' });
    expect(sqlite.prepare("SELECT value FROM companion_meta WHERE key = 'device_id'").pluck().get()).toBe('Old Phone');
    expect(sqlite.prepare("SELECT value FROM workspace_meta WHERE key = 'active_node_id'").pluck().get()).toBe('n');
    expect(sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id LIKE '%:Old Phone:%'").pluck().get()).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id LIKE '%:Other Phone:%'").pluck().get()).toBe(0);
  });

  it('rolls back v26 schema and state when cutover fails before version commit', async () => {
    const port = legacyFixture();

    await expect(bootstrapCompanionDatabase(port, {
      allowCreate: false,
      beforeVersionCommit: () => { throw new Error('injected companion Host failure'); },
      expectedHostName: 'New Phone',
      now: 'new'
    })).rejects.toThrow('injected companion Host failure');

    expect(sqlite.pragma('user_version', { simple: true })).toBe(26);
    expect(tableExists('node_reading_device_state')).toBe(true);
    expect(columns('setting_records')).toContain('device_id');
    expect(sqlite.prepare("SELECT value FROM companion_meta WHERE key = 'host_name'").get()).toBeUndefined();
  });
});

function columns(table: string) {
  return sqlite.prepare(`SELECT name FROM pragma_table_info(?)`).pluck().all(table);
}

function tableExists(table: string) {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").pluck().get(table));
}

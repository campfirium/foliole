// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { SYNC_PACK_FORMAT_VERSION } from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { migrateDesktopHostProfile } from './hostProfile.js';

const BASELINE = {
  companionSchema: 32,
  desktopSchema: 76,
  protocol: 3,
  syncPack: 12
} as const;

it('freezes the Host-state cutover versions and generated protocol assets', () => {
  expect({
    companionSchema: COMPANION_DATABASE_VERSION,
    desktopSchema: DATABASE_SCHEMA_VERSION,
    protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    syncPack: SYNC_PACK_FORMAT_VERSION
  }).toEqual(BASELINE);

  const android = readJson('android/app/src/main/assets/companion-sync-protocol-definitions.json');
  const ios = readJson('ios/App/App/companion-sync-protocol-definitions.json');
  expect(android).toEqual(ios);
  expect(readSchemaWindow(android)).toEqual({
    maximumSchemaVersion: BASELINE.desktopSchema,
    minimumSchemaVersion: BASELINE.desktopSchema
  });
});

it('creates only Host-scoped permanent state in a fresh desktop database', () => {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(BASELINE.desktopSchema);
  expect(columns(sqlite, 'node_reading_host_state')).toContain('host_name');
  expect(columns(sqlite, 'node_view_state')).toContain('host_name');
  expect(columns(sqlite, 'setting_records')).toContain('host_name');
  expect(tableExists(sqlite, 'node_reading_device_state')).toBe(false);
  sqlite.close();
});

it('rolls back the desktop v69 migration and version together', () => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE desktop_sources (
      source_ref TEXT PRIMARY KEY, source_type TEXT NOT NULL, config_ref TEXT NOT NULL,
      host_name TEXT NOT NULL, host_platform TEXT NOT NULL, root_path TEXT NOT NULL,
      path_flavor TEXT NOT NULL, type_settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE external_search_folders (
      id TEXT PRIMARY KEY, source_ref TEXT, owner_installation_id TEXT
    );
    INSERT INTO desktop_sources VALUES
      ('external:a','external','a','Mac','darwin','/Books','posix','{}','now','now');
    INSERT INTO external_search_folders VALUES ('a','external:a','installation-a');
    CREATE TRIGGER reject_owner_backfill BEFORE UPDATE ON desktop_sources
      BEGIN SELECT RAISE(ABORT, 'injected owner backfill failure'); END;
    PRAGMA user_version = 68;
  `);

  expect(() => initializeDatabaseSchema(sqlite)).toThrow('injected owner backfill failure');
  expect(sqlite.pragma('user_version', { simple: true })).toBe(68);
  expect(columns(sqlite, 'desktop_sources')).not.toContain('owner_installation_id');
  expect(sqlite.prepare('SELECT root_path FROM desktop_sources').pluck().get()).toBe('/Books');
  sqlite.close();
});

it('transfers the unique desktop Host scope while preserving permanent state', () => {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`
    INSERT INTO settings VALUES ('device_id', '"frozen-author"', 'old');
    INSERT INTO settings VALUES ('host_name', '"Old Mac"', 'old');
    INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('n', 'Node', 'old', 'old');
    INSERT INTO node_reading_host_state VALUES ('n', 'Old Mac', 44, 'old');
    INSERT INTO node_view_state VALUES ('n', 'Old Mac', 120, 2, 5, 'close-flush', 'old');
    INSERT INTO setting_records VALUES
      ('window_state','session_resume','windows','desktop','Old Mac','{"maximized":true}','old-hash','old',NULL);
    INSERT INTO workspace_meta VALUES ('active_node_id', 'n', 'old');
    INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES
      ('setting','session_resume:windows:desktop:Old Mac:window_state',1,'old-hash','frozen-author','old',0),
      ('view_state','session_resume:windows:desktop:Old Mac:node:n',2,'old-view','frozen-author','old',0),
      ('view_state','session_resume:windows:desktop:Other Mac:node:n',3,'other-view','frozen-author','old',0);
  `);
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite } as never;

  migrateDesktopHostProfile(connection, 'New Mac', 'new');
  migrateDesktopHostProfile(connection, 'New Mac', 'restart');

  expect(sqlite.prepare('SELECT host_name, reading_position FROM node_reading_host_state').get())
    .toEqual({ host_name: 'New Mac', reading_position: 44 });
  expect(sqlite.prepare('SELECT host_name, scroll_top, selection_from, selection_to FROM node_view_state').get())
    .toEqual({ host_name: 'New Mac', scroll_top: 120, selection_from: 2, selection_to: 5 });
  expect(sqlite.prepare('SELECT host_name, value_json FROM setting_records').get())
    .toEqual({ host_name: 'New Mac', value_json: '{"maximized":true}' });
  expect(sqlite.prepare("SELECT value FROM workspace_meta WHERE key = 'active_node_id'").pluck().get()).toBe('n');
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'device_id'").pluck().get()).toBe('"frozen-author"');
  expect(sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id LIKE '%:Old Mac:%'").pluck().get()).toBe(0);
  expect(sqlite.prepare("SELECT COUNT(*) FROM sync_object_state WHERE object_id LIKE '%:Other Mac:%'").pluck().get()).toBe(0);
  sqlite.close();
});

it('rolls back Host schema, version, and state when desktop cutover fails', () => {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  sqlite.exec(`
    INSERT INTO settings VALUES ('device_id', '"Old Mac"', 'old');
    INSERT INTO settings VALUES ('host_name', '"Old Mac"', 'old');
    ALTER TABLE node_reading_host_state RENAME TO node_reading_device_state;
    ALTER TABLE node_reading_device_state RENAME COLUMN host_name TO device_id;
    ALTER TABLE node_view_state RENAME COLUMN host_name TO device_id;
    ALTER TABLE setting_records RENAME COLUMN host_name TO device_id;
    PRAGMA user_version = 69;
  `);
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite } as never;

  expect(() => initializeDatabaseSchema(sqlite, { beforeVersionCommit: () => {
    migrateDesktopHostProfile(connection, 'New Mac', 'new');
    throw new Error('injected Host cutover failure');
  } })).toThrow('injected Host cutover failure');

  expect(sqlite.pragma('user_version', { simple: true })).toBe(69);
  expect(tableExists(sqlite, 'node_reading_device_state')).toBe(true);
  expect(columns(sqlite, 'setting_records')).toContain('device_id');
  expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'host_name'").pluck().get()).toBe('"Old Mac"');
  sqlite.close();
});

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8')) as unknown;
}

function readSchemaWindow(value: unknown) {
  const protocol = value as { syncPackEnvelope?: Record<string, unknown> };
  return {
    maximumSchemaVersion: protocol.syncPackEnvelope?.maximumSchemaVersion,
    minimumSchemaVersion: protocol.syncPackEnvelope?.minimumSchemaVersion
  };
}

function columns(sqlite: Database.Database, table: string) {
  return sqlite.prepare(`SELECT name FROM pragma_table_info(?)`).pluck().all(table);
}

function tableExists(sqlite: Database.Database, table: string) {
  return Boolean(sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).pluck().get(table));
}

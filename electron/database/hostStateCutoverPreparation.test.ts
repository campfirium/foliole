// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION, initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { SYNC_PACK_FORMAT_VERSION } from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const BASELINE = {
  companionSchema: 26,
  desktopSchema: 69,
  protocol: 1,
  syncPack: 4
} as const;

it('freezes the pre-cutover version contract and generated protocol assets', () => {
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

it('freezes the desktop v69 host-state input without changing its truth', () => {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);

  expect(sqlite.pragma('user_version', { simple: true })).toBe(BASELINE.desktopSchema);
  expect(columns(sqlite, 'node_reading_device_state')).toContain('device_id');
  expect(columns(sqlite, 'setting_records')).toContain('device_id');
  expect(tableExists(sqlite, 'node_reading_host_state')).toBe(false);
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

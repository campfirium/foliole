// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionSyncGroupHosts } from '../../lib/core/database/companionSyncGroupHostsMigration.js';
import { migrateSyncGroupHosts } from '../../lib/core/database/numberedMigrationSyncGroupHosts.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let sqlite: Database.Database;

afterEach(() => sqlite?.close());

function fixture() {
  sqlite = new Database(':memory:');
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  sqlite.exec(`
    DROP TRIGGER trg_sync_delivery_state_insert;
    DROP TRIGGER trg_sync_delivery_state_update;
    DROP TRIGGER trg_sync_delivery_member_leave;
    DROP TRIGGER trg_sync_delivery_review_insert;
    DROP TABLE sync_group_local_state;
    DROP TABLE sync_group_member_departures;
    DROP TABLE sync_group_members;
    DROP TABLE sync_groups;
    CREATE TABLE sync_groups (group_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
      timeline_id TEXT NOT NULL, created_by_device_id TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, workgroup_key TEXT);
    CREATE TABLE sync_group_members (group_id TEXT NOT NULL, device_id TEXT NOT NULL,
      device_kind TEXT NOT NULL, device_name TEXT NOT NULL, state TEXT NOT NULL,
      approved_by_device_id TEXT NOT NULL, authorization_id TEXT NOT NULL UNIQUE,
      provisioning_cursor INTEGER, joined_at TEXT NOT NULL, activated_at TEXT,
      left_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (group_id, device_id));
    CREATE TABLE sync_group_member_departures (group_id TEXT NOT NULL, device_id TEXT NOT NULL,
      authorized_by_device_id TEXT NOT NULL, authorization_id TEXT NOT NULL UNIQUE,
      left_at TEXT NOT NULL, PRIMARY KEY (group_id, device_id));
    CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, group_id TEXT,
      local_device_id TEXT NOT NULL, member_state TEXT NOT NULL, provisioning_cursor INTEGER,
      created_empty_proof_json TEXT, updated_at TEXT NOT NULL);
    INSERT INTO sync_groups VALUES
      ('group','Studio','timeline','device-a','2026-08-01','2026-08-03','secret');
    INSERT INTO sync_group_members VALUES
      ('group','device-a','darwin','Maci','active','device-a','auth-a',NULL,'2026-08-01',NULL,NULL,'2026-08-03'),
      ('group','device-b','android-capacitor','Maci','left','device-a','auth-b',NULL,'2026-08-02',NULL,'2026-08-03','2026-08-03');
    INSERT INTO sync_group_member_departures VALUES
      ('group','device-b','device-a','leave-b','2026-08-03');
    INSERT INTO sync_group_local_state VALUES
      (1,'group','device-a','active',NULL,NULL,'2026-08-03');
  `);
  return sqlite;
}

function snapshot(db: Database.Database) {
  return {
    departure: db.prepare(`SELECT host_name, authorized_by_host_name, authorization_id
      FROM sync_group_member_departures`).get(),
    group: db.prepare('SELECT created_by_host_name, workgroup_key FROM sync_groups').get(),
    local: db.prepare('SELECT local_host_name, member_state FROM sync_group_local_state').get(),
    members: db.prepare(`SELECT host_name, host_platform, state, authorization_id
      FROM sync_group_members ORDER BY joined_at`).all()
  };
}

const expected = {
  departure: { authorization_id: 'leave-b', authorized_by_host_name: 'Maci', host_name: 'Maci 2' },
  group: { created_by_host_name: 'Maci', workgroup_key: 'secret' },
  local: { local_host_name: 'Maci', member_state: 'active' },
  members: [
    { authorization_id: 'auth-a', host_name: 'Maci', host_platform: 'darwin', state: 'active' },
    { authorization_id: 'auth-b', host_name: 'Maci 2', host_platform: 'android-capacitor', state: 'left' }
  ]
};

it('migrates desktop members to unique Host facts without changing authorization or credentials', () => {
  const db = fixture();
  db.transaction(() => migrateSyncGroupHosts(db))();
  expect(snapshot(db)).toEqual(expected);
});

it('migrates companion members through the shared DbPort contract', async () => {
  const db = fixture();
  await migrateCompanionSyncGroupHosts(createBetterSqliteDbPort(db));
  expect(snapshot(db)).toEqual(expected);
});

it('rolls the destructive table reconstruction back on a failed version commit', () => {
  const db = fixture();
  expect(() => db.transaction(() => {
    migrateSyncGroupHosts(db);
    throw new Error('injected Host member migration failure');
  })()).toThrow('injected Host member migration failure');
  expect(db.prepare("SELECT name FROM pragma_table_info('sync_group_members')").pluck().all())
    .toContain('device_id');
  expect(db.prepare('SELECT authorization_id, device_name FROM sync_group_members ORDER BY joined_at').all())
    .toEqual([{ authorization_id: 'auth-a', device_name: 'Maci' },
      { authorization_id: 'auth-b', device_name: 'Maci' }]);
});

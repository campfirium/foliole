// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { migrateCompanionSyncGroupHosts } from '../../lib/core/database/companionSyncGroupHostsMigration.js';
import { migrateSyncGroupHosts } from '../../lib/core/database/numberedMigrationSyncGroupHosts.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { installLegacySyncGroupSchema } from './companionSyncGroupLegacyTestSchema.js';

let sqlite: Database.Database;

afterEach(() => sqlite?.close());

function fixture() {
  sqlite = new Database(':memory:');
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  installLegacySyncGroupSchema(sqlite);
  sqlite.exec(`
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
  expect(db.prepare(`SELECT authorization_id FROM delivery_authorization_migration_aliases
    WHERE group_id = 'group' AND peer_key = 'device-b'`).get()).toEqual({ authorization_id: 'auth-b' });
});

it('migrates companion members through the shared DbPort contract', async () => {
  const db = fixture();
  await migrateCompanionSyncGroupHosts(createBetterSqliteDbPort(db));
  expect(snapshot(db)).toEqual(expected);
  expect(db.prepare(`SELECT authorization_id FROM delivery_authorization_migration_aliases
    WHERE group_id = 'group' AND peer_key = 'device-b'`).get()).toEqual({ authorization_id: 'auth-b' });
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

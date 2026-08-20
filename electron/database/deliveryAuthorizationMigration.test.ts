import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDeliveryAuthorizations } from '../../lib/core/database/companionDeliveryAuthorizationMigration.js';
import { migrateDeliveryAuthorizations } from '../../lib/core/database/numberedMigrationDeliveryAuthorizations.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('moves receipts and cursors from Host aliases to the active authorization', () => {
  const sqlite = fixture();
  const migrate = sqlite.transaction(() => migrateDeliveryAuthorizations(sqlite));

  migrate();

  expect(columns(sqlite, 'sync_delivery_receipts')).toContain('authorization_id');
  expect(columns(sqlite, 'sync_delivery_receipts')).not.toContain('peer_id');
  expect(columns(sqlite, 'sync_peer_cursors')).toContain('authorization_id');
  expect(sqlite.prepare(`SELECT authorization_id, status FROM sync_delivery_receipts
    ORDER BY authorization_id`).all()).toEqual([
    { authorization_id: 'auth-b', status: 'accepted' },
    { authorization_id: 'auth-c', status: 'pending' }
  ]);
  expect(sqlite.prepare(`SELECT authorization_id, cursor_value FROM sync_peer_cursors
    ORDER BY authorization_id`).all()).toEqual([
    { authorization_id: 'auth-b', cursor_value: '8' },
    { authorization_id: 'auth-c', cursor_value: '3' }
  ]);

  sqlite.prepare("UPDATE sync_group_members SET host_name = 'Phone Renamed' WHERE authorization_id = 'auth-b'").run();
  expect(sqlite.prepare('SELECT authorization_id FROM sync_delivery_receipts WHERE authorization_id = ?')
    .get('auth-b')).toEqual({ authorization_id: 'auth-b' });
  sqlite.prepare("UPDATE sync_group_members SET state = 'left' WHERE authorization_id = 'auth-b'").run();
  expect(sqlite.prepare('SELECT authorization_id FROM sync_delivery_receipts').all())
    .toEqual([{ authorization_id: 'auth-c' }]);
  sqlite.close();
});

it('uses the same atomic authorization migration for companion databases', async () => {
  const sqlite = fixture();
  const port = createBetterSqliteDbPort(sqlite);

  await port.transaction((tx) => migrateCompanionDeliveryAuthorizations(tx));

  expect(sqlite.prepare(`SELECT authorization_id, status FROM sync_delivery_receipts
    ORDER BY authorization_id`).all()).toEqual([
    { authorization_id: 'auth-b', status: 'accepted' },
    { authorization_id: 'auth-c', status: 'pending' }
  ]);
  expect(sqlite.prepare('PRAGMA quick_check').pluck().get()).toBe('ok');
  sqlite.close();
});

it('rolls back without changing receipt keys when a reused Host alias is ambiguous', () => {
  const sqlite = fixture();
  sqlite.prepare("UPDATE sync_group_members SET host_name = 'Phone' WHERE authorization_id = 'auth-b'").run();
  sqlite.prepare("UPDATE sync_group_member_departures SET authorization_id = 'auth-c' WHERE host_name = 'Phone'").run();
  const migrate = sqlite.transaction(() => migrateDeliveryAuthorizations(sqlite));

  expect(migrate).toThrow('delivery_authorization_ambiguous:Phone');
  expect(columns(sqlite, 'sync_delivery_receipts')).toContain('peer_id');
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM sync_delivery_receipts').get()).toEqual({ count: 4 });
  sqlite.close();
});

it('ignores proven historical group rows without letting duplicate Host names pollute the active group', () => {
  const sqlite = fixture();
  sqlite.exec(`
    INSERT INTO sync_groups VALUES ('history','History','old','Phone 2','2026-07-01','2026-07-02',NULL);
    INSERT INTO sync_group_members VALUES
      ('history','Phone 2','mobile','active','Phone 2','auth-history',NULL,
       '2026-07-01','2026-07-01',NULL,'2026-07-02');
    CREATE TABLE delivery_authorization_migration_aliases (
      group_id TEXT NOT NULL, peer_key TEXT NOT NULL, authorization_id TEXT NOT NULL,
      PRIMARY KEY (group_id, peer_key, authorization_id));
    INSERT INTO delivery_authorization_migration_aliases VALUES
      ('history','device-history','auth-history');
    INSERT INTO sync_delivery_receipts VALUES
      ('device-history','state','setting:old:1','setting','old','hash-old','1','accepted','2',NULL,
       '2026-07-01','2026-07-02');
    INSERT INTO sync_peer_cursors VALUES ('device-history','state','2','2026-07-02');
  `);

  sqlite.transaction(() => migrateDeliveryAuthorizations(sqlite))();

  expect(sqlite.prepare("SELECT COUNT(*) FROM sync_delivery_receipts WHERE object_id = 'old'").pluck().get()).toBe(0);
  expect(sqlite.prepare("SELECT COUNT(*) FROM sync_peer_cursors WHERE authorization_id = 'auth-history'").pluck().get())
    .toBe(0);
  expect(sqlite.prepare("SELECT COUNT(*) FROM sqlite_master WHERE name = 'delivery_authorization_migration_aliases'")
    .pluck().get()).toBe(0);
  sqlite.close();
});

it('fails closed for an unclassified peer key in the active migration scope', () => {
  const sqlite = fixture();
  sqlite.prepare(`INSERT INTO sync_peer_cursors VALUES
    ('unknown-peer','state','9','2026-08-12')`).run();
  const migrate = sqlite.transaction(() => migrateDeliveryAuthorizations(sqlite));

  expect(migrate).toThrow('delivery_authorization_unmapped:unknown-peer');
  expect(columns(sqlite, 'sync_peer_cursors')).toContain('peer_id');
  sqlite.close();
});

function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL,
      current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_host_name TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL, base_content_hash TEXT,
      PRIMARY KEY (object_type, object_id));
    CREATE TABLE review_log (op_id TEXT PRIMARY KEY, host_name TEXT NOT NULL, reviewed_at TEXT NOT NULL);
    CREATE TABLE sync_delivery_receipts (
      peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, operation_id TEXT NOT NULL,
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, payload_identity TEXT NOT NULL,
      local_position TEXT, status TEXT NOT NULL, remote_position TEXT, issue_reason TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (peer_id, stream_name, operation_id));
    CREATE TABLE sync_peer_cursors (
      peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, cursor_value TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (peer_id, stream_name));
    INSERT INTO sync_groups VALUES ('group','Group','timeline','Local','2026-08-01','2026-08-19',NULL);
    INSERT INTO sync_group_members VALUES
      ('group','Local','desktop','active','Local','auth-local',NULL,'2026-08-01','2026-08-01',NULL,'2026-08-19'),
      ('group','Phone 2','mobile','active','Local','auth-b',NULL,'2026-08-01','2026-08-01',NULL,'2026-08-19'),
      ('group','Tablet','mobile','active','Local','auth-c',NULL,'2026-08-01','2026-08-01',NULL,'2026-08-19'),
      ('group','Left','mobile','left','Local','auth-d',NULL,'2026-08-01','2026-08-01','2026-08-18','2026-08-18');
    INSERT INTO sync_group_local_state VALUES (1,'group','Local','active',NULL,NULL,'2026-08-19');
    INSERT INTO sync_group_member_departures VALUES
      ('group','Phone','Local','auth-b','2026-08-10'),
      ('group','Left','Local','auth-d','2026-08-18');
    INSERT INTO sync_delivery_receipts VALUES
      ('Phone','state','setting:a:1','setting','a','hash-a','1','pending',NULL,NULL,'2026-08-10','2026-08-10'),
      ('auth-b','state','setting:a:1','setting','a','hash-a','1','accepted','8',NULL,'2026-08-10','2026-08-11'),
      ('Tablet','state','setting:b:1','setting','b','hash-b','1','pending',NULL,NULL,'2026-08-10','2026-08-10'),
      ('Left','state','setting:c:1','setting','c','hash-c','1','pending',NULL,NULL,'2026-08-10','2026-08-10');
    INSERT INTO sync_peer_cursors VALUES
      ('Phone','state','4','2026-08-10'), ('auth-b','state','8','2026-08-11'),
      ('Tablet','state','3','2026-08-10'), ('Left','state','2','2026-08-10');
  `);
  return sqlite;
}

function columns(sqlite: Database.Database, table: string) {
  return (sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);
}

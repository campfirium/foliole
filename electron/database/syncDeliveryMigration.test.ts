import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { migrateSyncDeliveryReceipts } from '../../lib/core/database/numberedMigrationSyncDelivery.js';
import { SYNC_DELIVERY_SCHEMA_STATEMENTS } from '../../lib/core/database/syncDeliverySchemaStatements.js';
import { SYNC_DELIVERY_TRIGGER_STATEMENTS } from '../../lib/core/database/syncDeliveryTriggerStatements.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from '../../lib/core/database/syncGroupSchemaStatements.js';

const files: string[] = [];

afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

it('replaces legacy acknowledgements with pending obligations for every active peer', () => {
  const sqlite = new Database(':memory:');
  installLegacyFixture(sqlite);
  migrateSyncDeliveryReceipts(sqlite);

  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sync_push_ack'").get()).toBeUndefined();
  expect(sqlite.prepare(
    'SELECT peer_id, object_id, status FROM sync_delivery_receipts ORDER BY peer_id'
  ).all()).toEqual([
    { object_id: 'setting-a', peer_id: 'peer-b', status: 'pending' },
    { object_id: 'setting-a', peer_id: 'peer-c', status: 'pending' }
  ]);
  expect(sqlite.prepare("SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_id = 'setting-a'").get())
    .toEqual({ content_hash: 'hash-a', sync_dirty: 1 });
  sqlite.close();
});

it('persists peer-scoped obligations across reopen and clears only the member that leaves', () => {
  const root = path.resolve('.tmp/artifacts');
  fs.mkdirSync(root, { recursive: true });
  const databasePath = path.join(root, `t122-delivery-${process.pid}-${Date.now()}.db`);
  files.push(databasePath);
  let sqlite = new Database(databasePath);
  installDeliverySchema(sqlite);
  installGroup(sqlite);
  sqlite.exec(`
    INSERT INTO sync_peer_cursors VALUES ('peer-b','state','1','2026-08-09T00:00:00Z');
    INSERT INTO sync_peer_cursors VALUES ('peer-c','state','1','2026-08-09T00:00:00Z');
    INSERT INTO sync_object_state VALUES
      ('setting','setting-a',1,NULL,'hash-a','local','2026-08-09T00:00:00Z',NULL,1,NULL);
  `);
  sqlite.close();

  sqlite = new Database(databasePath);
  expect(sqlite.prepare('SELECT peer_id FROM sync_delivery_receipts ORDER BY peer_id').all())
    .toEqual([{ peer_id: 'peer-b' }, { peer_id: 'peer-c' }]);
  sqlite.prepare("UPDATE sync_group_members SET state = 'left' WHERE device_id = 'peer-b'").run();
  expect(sqlite.prepare('SELECT peer_id FROM sync_delivery_receipts').all()).toEqual([{ peer_id: 'peer-c' }]);
  expect(sqlite.prepare('SELECT peer_id FROM sync_peer_cursors ORDER BY peer_id').all())
    .toEqual([{ peer_id: 'peer-c' }]);
  sqlite.close();
});

function installLegacyFixture(sqlite: Database.Database) {
  installDeliveryPrerequisites(sqlite);
  installGroup(sqlite);
  sqlite.exec(`
    CREATE TABLE sync_push_ack (client_op_id TEXT PRIMARY KEY, status TEXT NOT NULL);
    INSERT INTO sync_push_ack VALUES ('legacy-op','accepted');
    INSERT INTO sync_object_state VALUES
      ('setting','setting-a',7,NULL,'hash-a','local','2026-08-09T00:00:00Z',NULL,1,NULL);
  `);
}

function installDeliverySchema(sqlite: Database.Database) {
  installDeliveryPrerequisites(sqlite);
  for (const statement of SYNC_DELIVERY_SCHEMA_STATEMENTS) sqlite.exec(statement);
  for (const statement of SYNC_DELIVERY_TRIGGER_STATEMENTS) sqlite.exec(statement);
}

function installDeliveryPrerequisites(sqlite: Database.Database) {
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT NOT NULL, object_id TEXT NOT NULL, state_seq INTEGER NOT NULL,
      current_version_id TEXT, content_hash TEXT NOT NULL, last_modified_by_device_id TEXT NOT NULL,
      updated_at TEXT NOT NULL, deleted_at TEXT, sync_dirty INTEGER NOT NULL, base_content_hash TEXT,
      PRIMARY KEY (object_type, object_id));
    CREATE TABLE sync_peer_cursors (
      peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, cursor_value TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (peer_id, stream_name));
    CREATE TABLE review_log (
      op_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, reviewed_at TEXT NOT NULL);
  `);
}

function installGroup(sqlite: Database.Database) {
  sqlite.exec(`
    INSERT INTO sync_groups VALUES ('group','Group','timeline','local','2026-08-01','2026-08-09');
    INSERT INTO sync_group_local_state VALUES (1,'group','local','active',NULL,NULL,'2026-08-09');
    INSERT INTO sync_group_members VALUES
      ('group','local','desktop','Local','active','local','auth-local',NULL,'2026-08-01',NULL,NULL,'2026-08-09'),
      ('group','peer-b','mobile','B','active','local','auth-b',NULL,'2026-08-01',NULL,NULL,'2026-08-09'),
      ('group','peer-c','mobile','C','active','local','auth-c',NULL,'2026-08-01',NULL,NULL,'2026-08-09');
  `);
}

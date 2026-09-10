import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { loadSyncStateObjectsSinceFromDriver } from './syncObjectsFromDriver.js';

let sqlite: Database.Database | null = null;
afterEach(() => sqlite?.close());

function fixture(withIdentity: boolean) {
  sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE sync_object_state (
      object_type TEXT, object_id TEXT, state_seq INTEGER, content_hash TEXT,
      last_modified_by_host_name TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE attachment_sync_tombstones (
      attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT,
      mime_type TEXT, deleted_at TEXT, updated_at TEXT
    );
    INSERT INTO sync_object_state VALUES (
      'attachment', 'att-1', 7, 'portable-hash', 'Mac', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'
    );
  `);
  if (withIdentity) {
    sqlite.exec(`INSERT INTO attachment_sync_tombstones VALUES (
      'att-1', '${'a'.repeat(64)}', 'att-1', 'image/webp',
      '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z'
    )`);
  }
  return createBetterSqlite3Driver(sqlite);
}

it('emits identity-bearing attachment tombstones beyond an existing cursor', () => {
  const [record] = loadSyncStateObjectsSinceFromDriver(fixture(true), 6);
  expect(record).toMatchObject({ deleted_at: '2026-09-10T00:00:00.000Z', object_id: 'att-1', state_seq: 7 });
  expect(JSON.parse(record?.payload_json ?? 'null')).toEqual({
    attachment_id: 'att-1', content_hash: 'a'.repeat(64), mime_type: 'image/webp', storage_key: 'att-1'
  });
});

it('refuses to emit a deleted attachment without its resource identity', () => {
  expect(() => loadSyncStateObjectsSinceFromDriver(fixture(false), 0)).toThrow('identity is missing');
});

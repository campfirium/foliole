// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

function fixture() {
  const database = new Database(':memory:');
  database.exec('CREATE TABLE body_bytes (id TEXT PRIMARY KEY, byte_length INTEGER, data BLOB)');
  const native = createFakeCapacitorConnection(database);
  const connection = {
    ...native,
    async query(sql: string, params: unknown[]) {
      const result = await native.query(sql, params);
      // The iOS plugin maps SQLite's genuine zero-length BLOB pointer to JSON null.
      return { values: result.values.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, Array.isArray(value) && value.length === 0 ? null : value]))) };
    }
  };
  const db = createCapacitorSqliteDbPort(connection as never, 'ios');
  const bytes = new Uint8Array();
  return { database, db, bytes };
}

const read = 'SELECT byte_length, data, typeof(data) AS type, length(data) AS bytes FROM body_bytes';
const insert = 'INSERT INTO body_bytes VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING';

it('preserves a genuine empty BLOB and its metadata through the iOS null pointer contract', async () => {
  const host = fixture();
  try {
    await host.db.run(insert, ['empty', 0n, host.bytes]);
    await host.db.run(insert, ['empty', 0n, host.bytes]);
    expect(await host.db.query(read)).toEqual([{ byte_length: 0, data: null, type: 'blob', bytes: 0 }]);
    expect(host.database.prepare(read).get())
      .toEqual({ byte_length: 0, data: Buffer.alloc(0), type: 'blob', bytes: 0 });
  } finally { host.database.close(); }
});

it.each([
  { update: 'data = NULL', row: { byte_length: 0, data: null, type: 'null', bytes: null } },
  { update: "data = ''", row: { byte_length: 0, data: '', type: 'text', bytes: 0 } },
  { update: "data = X'00'", row: { byte_length: 0, data: Uint8Array.of(0), type: 'blob', bytes: 1 } },
  { update: 'byte_length = 1', row: { byte_length: 1, data: null, type: 'blob', bytes: 0 } }
])('distinguishes $update from a valid empty BLOB without coercion', async ({ update, row }) => {
  const host = fixture();
  try {
    await host.db.run(insert, ['empty', 0n, host.bytes]);
    host.database.exec(`UPDATE body_bytes SET ${update}`);
    expect(await host.db.query(read)).toEqual([row]);
  } finally { host.database.close(); }
});

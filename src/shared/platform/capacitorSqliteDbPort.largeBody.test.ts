// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

it('stores a full iOS body with bounded JSON and preserves all bytes after reopening SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'foliole-ios-body-'));
  const path = join(directory, 'body.sqlite');
  const database = new Database(path);
  database.exec('CREATE TABLE body_bytes (id TEXT PRIMARY KEY, byte_length INTEGER, data BLOB)');
  const native = createFakeCapacitorConnection(database);
  const wireSizes: number[] = [];
  const wire = <T>(value: T): T => {
    const json = JSON.stringify(value);
    wireSizes.push(new TextEncoder().encode(json).byteLength);
    return JSON.parse(json);
  };
  const connection = {
    ...native,
    run: (sql: string, params: unknown[]) => native.run(sql, wire(params)),
    executeSet: (set: Parameters<typeof native.executeSet>[0]) => native.executeSet(wire(set))
  };
  const suffix = ' 手机编辑🙂';
  const bytes = new TextEncoder().encode('A'.repeat(1_048_576 - Buffer.byteLength(suffix)) + suffix);
  const db = createCapacitorSqliteDbPort(connection as never, 'ios');
  try {
    expect(bytes.byteLength).toBe(1_048_576);
    await db.transaction((tx) => tx.run('INSERT INTO body_bytes VALUES (?, ?, ?)', ['body', BigInt(bytes.byteLength), bytes]));
    expect(Math.max(...wireSizes)).toBeLessThanOrEqual(4 * 1024 * 1024);
    database.close();
    const reopened = new Database(path, { readonly: true });
    try {
      const port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(reopened) as never, 'ios');
      expect(await port.query('SELECT byte_length, data FROM body_bytes')).toEqual([{ byte_length: bytes.byteLength, data: bytes }]);
      expect(reopened.prepare('SELECT typeof(data) AS type, length(data) AS bytes FROM body_bytes').get())
        .toEqual({ type: 'blob', bytes: bytes.byteLength });
    } finally { reopened.close(); }
  } finally {
    if (database.open) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

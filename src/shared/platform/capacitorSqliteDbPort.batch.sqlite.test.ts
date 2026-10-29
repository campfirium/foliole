// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbBatchPort } from '../../../lib/core/sync/dbStatements';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

it.each(['android', 'ios'])('binds a batch and rolls all writes back on a later failure (%s)', async platform => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec('CREATE TABLE data(id INTEGER PRIMARY KEY, value BLOB)');
    const connection = createFakeCapacitorConnection(sqlite);
    const executeSet = vi.spyOn(connection, 'executeSet');
    const db = createCapacitorSqliteDbPort(connection as never, platform) as DbBatchPort;
    await db.transaction(tx => (tx as typeof db).batch([
      { sql: 'INSERT INTO data VALUES(?,?)', params: [1, new Uint8Array([0, 255])] },
      { sql: 'INSERT INTO data VALUES(?,?)', params: [2, "bound ' text; DELETE FROM data"] },
      { sql: 'DELETE FROM data WHERE id=?', params: [2] }
    ]));
    expect(executeSet).toHaveBeenCalledTimes(1);
    expect(executeSet.mock.calls[0]?.[1]).toBe(false);
    expect(await db.query('SELECT * FROM data')).toEqual([{ id: 1, value: new Uint8Array([0, 255]) }]);
    await expect(db.transaction(tx => (tx as typeof db).batch([
      { sql: 'INSERT INTO data VALUES(?,?)', params: [2, 'second'] },
      { sql: 'INSERT INTO data VALUES(?,?)', params: [1, 'duplicate'] }
    ]))).rejects.toThrow();
    expect(await db.query('SELECT id FROM data')).toEqual([{ id: 1 }]);
    if (platform === 'android') expect(executeSet.mock.calls[0]?.[0][2]?.statement).toMatch(/^WITH foliole_delete/);
    await expect(db.batch([{ sql: 'DELETE FROM data' }])).rejects.toThrow('outer transaction');
  } finally { sqlite.close(); }
});

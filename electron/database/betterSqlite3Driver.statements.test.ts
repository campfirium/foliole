// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { guardBetterSqliteDatabase } from './guardedBetterSqliteDatabase.js';

it('avoids a native statement per repeated business operation without retaining parameters', async () => {
  const raw = new Database(':memory:');
  const sqlite = guardBetterSqliteDatabase(raw);
  const driver = createBetterSqlite3Driver(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  const prepare = vi.spyOn(raw, 'prepare');
  const insert = 'INSERT INTO items VALUES (?, ?)';
  const read = 'SELECT value FROM items WHERE id = ?';
  try {
    sqlite.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)');
    for (let id = 0; id < 1000; id++) {
      driver.execute(insert, [id, String(id)]);
      expect(driver.queryOne(read, [id])).toEqual({ value: String(id) });
    }
    await port.run(insert, [1000, 'last']);
    expect(await port.query(read, [1000])).toEqual([{ value: 'last' }]);
    expect(prepare.mock.calls.filter(([sql]) => sql === insert)).toHaveLength(1);
    expect(prepare.mock.calls.filter(([sql]) => sql === read)).toHaveLength(1);
    expect(() => driver.transaction(tx => {
      tx.execute(insert, [1001, 'rollback']);
      throw new Error('rollback');
    })).toThrow('rollback');
    expect(driver.queryOne(read, [1001])).toBeUndefined();
    sqlite.exec('DROP TABLE items; CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT, extra TEXT)');
    driver.execute('INSERT INTO items VALUES (?, ?, ?)', [1, 'new', 'schema']);
    expect(driver.queryOne(read, [1])).toEqual({ value: 'new' });
  } finally { prepare.mockRestore(); sqlite.close(); }
});

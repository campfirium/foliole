// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { sqlRecording } from '../../lib/core/diagnostics/sqlRecording.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

afterEach(() => { sqlRecording.stop(); });

it('records cached desktop driver and port calls while retaining rollback, binding and error behavior', async () => {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT)');
  const driver = createBetterSqlite3Driver(sqlite);
  const port = createBetterSqliteDbPort(sqlite);
  sqlRecording.start({ label: 'save' });
  try {
    for (let i = 0; i < 30; i++) driver.execute('INSERT INTO notes VALUES (?, ?)', [i, 'secret-body']);
    expect(driver.prepare('SELECT value FROM notes WHERE id = ?').get([1])).toEqual({ value: 'secret-body' });
    expect(await port.query('SELECT id FROM notes')).toHaveLength(30);
    await expect(port.transaction(async tx => {
      await tx.run('DELETE FROM notes');
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(driver.queryOne('SELECT COUNT(*) AS count FROM notes')).toEqual({ count: 30 });
    expect(() => driver.execute('INSERT INTO notes VALUES (?, ?)', [1, 'duplicate'])).toThrow();
    const report = sqlRecording.stop()!;
    expect(report.groups.find(group => group.sql === 'INSERT INTO notes VALUES (?, ?)'))
      .toMatchObject({ count: 31, errors: 1, host: 'desktop' });
    expect(report.groups.find(group => group.sql === 'SELECT id FROM notes')).toMatchObject({ returnedRows: 30 });
    expect(JSON.stringify(report)).not.toContain('secret-body');
  } finally { sqlite.close(); }
});

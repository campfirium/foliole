// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { sqlRecording } from '../../../lib/core/diagnostics/sqlRecording';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';

afterEach(() => { sqlRecording.stop(); });

it.each(['android', 'ios'])('records %s adapter operations against real SQLite with transaction results preserved', async platform => {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, value TEXT)');
  const port = createCapacitorSqliteDbPort(connectionOver(sqlite) as never, platform);
  sqlRecording.start({ label: 'mobile-edit' });
  try {
    await port.run('INSERT INTO notes VALUES (?, ?)', [1, 'secret-body']);
    expect(await port.query('SELECT value FROM notes')).toEqual([{ value: 'secret-body' }]);
    await expect(port.transaction(async tx => {
      await tx.run('DELETE FROM notes'); throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await port.query('SELECT id FROM notes')).toEqual([{ id: 1 }]);
    await expect(port.run('INSERT INTO notes VALUES (?, ?)', [1, 'duplicate'])).rejects.toThrow();
    const report = sqlRecording.stop()!;
    expect(report.groups.find(group => group.sql === 'INSERT INTO notes VALUES (?, ?)'))
      .toMatchObject({ count: 2, errors: 1, host: platform });
    expect(report.groups.find(group => group.sql === 'SELECT value FROM notes')).toMatchObject({ returnedRows: 1 });
    expect(JSON.stringify(report)).not.toContain('secret-body');
  } finally { sqlite.close(); }
});

function connectionOver(sqlite: Database.Database) {
  return {
    async run(sql: string, values: unknown[]) {
      const result = sqlite.prepare(sql).run(...values);
      return { changes: { changes: result.changes, lastId: Number(result.lastInsertRowid) } };
    },
    async query(sql: string, values: unknown[]) { return { values: sqlite.prepare(sql).all(...values) }; },
    async beginTransaction() { sqlite.exec('BEGIN'); },
    async commitTransaction() { sqlite.exec('COMMIT'); },
    async rollbackTransaction() { sqlite.exec('ROLLBACK'); }
  };
}

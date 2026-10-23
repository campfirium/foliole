// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';

function connectionOver(sqlite: Database.Database) {
  const sent: string[] = [];
  return {
    sent,
    connection: {
      run: vi.fn(async (statement: string, values: unknown[]) => {
        sent.push(statement);
        const result = sqlite.prepare(statement).run(...values);
        return { changes: { changes: result.changes, lastId: Number(result.lastInsertRowid) } };
      }),
      query: vi.fn(async (statement: string, values: unknown[]) => ({ values: sqlite.prepare(statement).all(...values) })),
      executeSet: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn()
    }
  };
}

function seeded() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`CREATE TABLE notes (id INTEGER PRIMARY KEY, parent TEXT);
    INSERT INTO notes (id, parent) VALUES (1, 'a'), (2, 'a'), (3, 'b');`);
  return sqlite;
}

it.each([
  'DELETE FROM notes WHERE parent = ?',
  '  \n delete from notes WHERE parent = ?'
])('sends Android deletes so the SQLite plugin skips its per-delete schema scan: %j', async (sql) => {
  const sqlite = seeded();
  const { connection, sent } = connectionOver(sqlite);
  const db = createCapacitorSqliteDbPort(connection as never, 'android');

  await expect(db.run(sql, ['a'])).resolves.toMatchObject({ changes: 2 });

  // The Android plugin scans every table before any statement whose first word is DELETE.
  expect(sent[0]!.trim().split(/\s+/u)[0]!.toUpperCase()).not.toBe('DELETE');
  expect(sqlite.prepare('SELECT id FROM notes ORDER BY id').pluck().all()).toEqual([3]);
});

it('leaves iOS deletes and other Android statements unchanged', async () => {
  const sqlite = seeded();
  const ios = connectionOver(sqlite);
  await createCapacitorSqliteDbPort(ios.connection as never, 'ios').run('DELETE FROM notes WHERE id = ?', [1]);
  expect(ios.sent).toEqual(['DELETE FROM notes WHERE id = ?']);

  const android = connectionOver(sqlite);
  const db = createCapacitorSqliteDbPort(android.connection as never, 'android');
  await db.run('UPDATE notes SET parent = ? WHERE id = ?', ['c', 2]);
  await db.run('WITH gone(id) AS (SELECT 3) DELETE FROM notes WHERE id IN (SELECT id FROM gone)');
  expect(android.sent).toEqual(['UPDATE notes SET parent = ? WHERE id = ?',
    'WITH gone(id) AS (SELECT 3) DELETE FROM notes WHERE id IN (SELECT id FROM gone)']);
  expect(sqlite.prepare('SELECT id, parent FROM notes').all()).toEqual([{ id: 2, parent: 'c' }]);
});

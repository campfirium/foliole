// @vitest-environment node
import { createRequire } from 'node:module';

import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { guardBetterSqliteDatabase } from './guardedBetterSqliteDatabase.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as typeof import('better-sqlite3');

it('keeps parameter values isolated across ports, rollback and later successful transactions', async () => {
  const sqlite = guardBetterSqliteDatabase(new Database(':memory:'));
  const a = createBetterSqliteDbPort(sqlite);
  const b = createBetterSqliteDbPort(sqlite);
  const insert = 'INSERT INTO items (id, content) VALUES (?, ?)';
  const read = 'SELECT content FROM items WHERE id = ?';
  try {
    await a.run('CREATE TABLE items (id TEXT PRIMARY KEY, content TEXT NOT NULL)');
    const body = 'x'.repeat(1024 * 1024);
    await a.transaction(tx => tx.run(insert, ['first', body]));
    await expect(b.transaction(async tx => {
      await tx.run(insert, ['rollback', 'discard']);
      await tx.run(insert, ['first', 'duplicate']);
    })).rejects.toThrow();
    await b.transaction(tx => tx.run(insert, ['second', 'second body']));
    expect(await b.query(read, ['first'])).toEqual([{ content: body }]);
    expect(await a.query(read, ['second'])).toEqual([{ content: 'second body' }]);
    expect(await a.query(read, ['rollback'])).toEqual([]);
    await expect(a.run(insert, ['missing parameter'])).rejects.toThrow();
    await a.run(insert, ['third', 'third body']);
    expect(await b.query(read, ['third'])).toEqual([{ content: 'third body' }]);
  } finally { sqlite.close(); }
});

it('reads the current schema after table replacement and unrelated queries', async () => {
  const sqlite = guardBetterSqliteDatabase(new Database(':memory:'));
  const port = createBetterSqliteDbPort(sqlite);
  try {
    await port.run('CREATE TABLE items (id INTEGER PRIMARY KEY, old_value TEXT)');
    await port.run("INSERT INTO items VALUES (1, 'old')");
    expect(await port.query('SELECT * FROM items WHERE id = ?', [1]))
      .toEqual([{ id: 1, old_value: 'old' }]);
    await port.run('DROP TABLE items');
    await port.run('CREATE TABLE items (id INTEGER PRIMARY KEY, new_value TEXT)');
    await port.run("INSERT INTO items VALUES (1, 'new')");
    expect(await port.query('SELECT * FROM items WHERE id = ?', [1]))
      .toEqual([{ id: 1, new_value: 'new' }]);
    for (let index = 0; index < 200; index += 1) {
      expect(await port.query(`SELECT ? AS value /* ${index} */`, [index]))
        .toEqual([{ value: index }]);
    }
    expect(await port.query('SELECT * FROM items WHERE id = ?', [1]))
      .toEqual([{ id: 1, new_value: 'new' }]);
  } finally { sqlite.close(); }
});

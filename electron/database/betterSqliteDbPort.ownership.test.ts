// @vitest-environment node

import { createRequire } from 'node:module';

import { afterEach, expect, it } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { guardBetterSqliteDatabase } from './guardedBetterSqliteDatabase.js';
import { SqliteConnectionOwnerError } from './sqliteConnectionCoordinator.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const opened: import('better-sqlite3').Database[] = [];

afterEach(() => {
  for (const sqlite of opened.splice(0)) {
    if (sqlite.open) sqlite.close();
  }
});

function createFixture() {
  const raw = new BetterSqlite3(':memory:');
  const sqlite = guardBetterSqliteDatabase(raw);
  opened.push(sqlite);
  sqlite.exec('CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return {
    driver: createBetterSqlite3Driver(sqlite),
    portA: createBetterSqliteDbPort(sqlite, { name: 'owner-a' }),
    portB: createBetterSqliteDbPort(sqlite, { name: 'owner-b' }),
    sqlite
  };
}

function barrier() {
  let release!: () => void;
  let signal!: () => void;
  return {
    entered: new Promise<void>((resolve) => { signal = resolve; }),
    release: () => release(),
    signal: () => signal(),
    wait: new Promise<void>((resolve) => { release = resolve; })
  };
}

it('serializes transactions from different ports on one connection', async () => {
  const { portA, portB, sqlite } = createFixture();
  const gate = barrier();
  const order: string[] = [];
  const first = portA.transaction(async (tx) => {
    await tx.run('INSERT INTO items (id, value) VALUES (?, ?)', ['a', 'A']);
    order.push('a-entered');
    gate.signal();
    await gate.wait;
    order.push('a-leaving');
  });
  await gate.entered;
  let secondFinished = false;
  const second = portB.transaction(async (tx) => {
    await tx.run('INSERT INTO items (id, value) VALUES (?, ?)', ['b', 'B']);
    order.push('b');
  }).then(() => { secondFinished = true; });

  await Promise.resolve();
  expect(secondFinished).toBe(false);
  gate.release();
  await Promise.all([first, second]);

  expect(order).toEqual(['a-entered', 'a-leaving', 'b']);
  expect(sqlite.prepare('SELECT id FROM items ORDER BY id').all()).toEqual([{ id: 'a' }, { id: 'b' }]);
});

it('releases the next owner after rollback without leaking prior writes', async () => {
  const { portA, portB, sqlite } = createFixture();
  const gate = barrier();
  const first = portA.transaction(async (tx) => {
    await tx.run('INSERT INTO items (id, value) VALUES (?, ?)', ['rolled-back', 'A']);
    gate.signal();
    await gate.wait;
    throw new Error('rollback-a');
  });
  await gate.entered;
  const second = portB.transaction(async (tx) => {
    await tx.run('INSERT INTO items (id, value) VALUES (?, ?)', ['kept', 'B']);
  });

  gate.release();
  await expect(first).rejects.toThrow('rollback-a');
  await second;
  expect(sqlite.prepare('SELECT id FROM items').all()).toEqual([{ id: 'kept' }]);
});

it('blocks non-owner driver and raw access while an async owner is active', async () => {
  const { driver, portA, sqlite } = createFixture();
  const preparedInsert = sqlite.prepare('INSERT INTO items (id, value) VALUES (?, ?)');
  const preparedRead = sqlite.prepare('SELECT id FROM items').pluck();
  const rawTransaction = sqlite.transaction(() => undefined);
  const gate = barrier();
  const active = portA.transaction(async () => {
    gate.signal();
    await gate.wait;
  });
  await gate.entered;

  expect(() => driver.execute('INSERT INTO items (id, value) VALUES (?, ?)', ['driver', 'D']))
    .toThrow(SqliteConnectionOwnerError);
  expect(() => driver.transaction(() => undefined)).toThrow(SqliteConnectionOwnerError);
  expect(() => sqlite.prepare('SELECT id FROM items').all()).toThrow(SqliteConnectionOwnerError);
  expect(() => preparedInsert.run('prepared', 'P')).toThrow(SqliteConnectionOwnerError);
  expect(() => preparedRead.all()).toThrow(SqliteConnectionOwnerError);
  expect(() => rawTransaction()).toThrow(SqliteConnectionOwnerError);
  expect(preparedInsert.database).toBe(sqlite);

  gate.release();
  await active;
});

it('allows same-owner nested access and invalidates escaped transaction ports', async () => {
  const { driver, portA, portB, sqlite } = createFixture();
  let escaped: DbPort | null = null;
  await portA.transaction(async (tx) => {
    escaped = tx;
    driver.execute('INSERT INTO items (id, value) VALUES (?, ?)', ['driver', 'D']);
    sqlite.prepare('INSERT INTO items (id, value) VALUES (?, ?)').run('raw', 'R');
    await portB.transaction(async (nested) => {
      await nested.run('INSERT INTO items (id, value) VALUES (?, ?)', ['nested', 'N']);
    });
  });

  expect(sqlite.prepare('SELECT id FROM items ORDER BY id').all())
    .toEqual([{ id: 'driver' }, { id: 'nested' }, { id: 'raw' }]);
  expect(() => escaped?.run('INSERT INTO items (id, value) VALUES (?, ?)', ['late', 'L']))
    .toThrow('sqlite transaction scope is no longer active');
});

it('does not treat an uncoordinated manual transaction as a nested owner', async () => {
  const { portA, sqlite } = createFixture();
  sqlite.exec('BEGIN IMMEDIATE');
  await expect(portA.transaction(async () => undefined))
    .rejects.toThrow('sqlite connection has an uncoordinated active transaction');
  sqlite.exec('ROLLBACK');
});

it('rejects close during owned work and isolates a reopened connection', async () => {
  const { portA, sqlite } = createFixture();
  const gate = barrier();
  const active = portA.transaction(async () => {
    gate.signal();
    await gate.wait;
  });
  await gate.entered;
  expect(() => sqlite.close()).toThrow('cannot close sqlite connection while coordinated work is active');
  gate.release();
  await active;
  sqlite.close();

  const reopened = guardBetterSqliteDatabase(new BetterSqlite3(':memory:'));
  opened.push(reopened);
  expect(reopened.prepare('SELECT 1 AS ok').get()).toEqual({ ok: 1 });
});

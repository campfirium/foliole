// @vitest-environment node
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import { bodyJsonHolderContainsBody, type BodyJsonHolder } from './bodyHolderScalarHash.js';
import { BODY_READ_CHUNK_BYTES } from './bodyReadBudget.js';

const holder = { table: 'node_sync_conflicts', column: 'snapshot_json' } as const;
const identity = (body: string) => ({ hash: createHash('sha256').update(body).digest('hex'),
  byteLength: Buffer.byteLength(body) });

function fixture() {
  const sqlite = new Database(':memory:');
  sqlite.exec('CREATE TABLE node_sync_conflicts (snapshot_json TEXT NOT NULL)');
  const db = createBetterSqliteDbPort(sqlite);
  const observed = { maximumBytes: 0, reads: 0 };
  const boundedPort: DbPort = {
    ...db,
    async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]) {
      const rows = await db.query<T>(sql, params);
      expect(rows.length).toBeLessThanOrEqual(1);
      for (const row of rows) for (const value of Object.values(row)) {
        expect(typeof value).not.toBe('string');
        if (value instanceof Uint8Array) {
          expect(value.byteLength).toBeLessThanOrEqual(BODY_READ_CHUNK_BYTES);
          observed.maximumBytes = Math.max(observed.maximumBytes, value.byteLength);
          observed.reads += 1;
        }
      }
      return rows;
    }
  };
  const put = (rowid: number, value: unknown) => sqlite.prepare(
    'INSERT INTO node_sync_conflicts (rowid, snapshot_json) VALUES (?, ?)'
  ).run(rowid, JSON.stringify(value));
  const contains = (body: string) => db.transaction(() =>
    bodyJsonHolderContainsBody(boundedPort, holder, identity(body)));
  return { sqlite, observed, put, contains, db: boundedPort };
}

it.each(['value', 'key'] as const)('hashes a nested 3 MiB %s without returning JSON or scalars', async (field) => {
  const test = fixture();
  const body = '\ufeff' + '中😀\0文'.repeat(310_000);
  const other = body.replace('中', '文');
  expect(identity(body).byteLength).toBeGreaterThan(3 * 1024 * 1024);
  try {
    test.put(-2, field === 'value' ? { nested: [other] } : { nested: [{ [other]: false }] });
    test.put(3, field === 'value' ? { nested: [{ original: body }] } : { nested: [{ [body]: 1 }] });
    expect(await test.contains(body)).toBe(true);
    expect(test.observed.maximumBytes).toBe(BODY_READ_CHUNK_BYTES);
    expect(test.observed.reads).toBeGreaterThan(6);
    expect(test.sqlite.prepare('SELECT count(*) FROM node_sync_conflicts').pluck().get()).toBe(2);
  } finally { test.sqlite.close(); }
});

it.each(['value', 'key'] as const)('finds an empty %s and ignores non-text JSON values', async (field) => {
  const test = fixture();
  try {
    test.put(1, { values: [null, 0, false, {}] });
    expect(await test.contains('')).toBe(false);
    test.put(2, field === 'value' ? { nested: [''] } : { nested: [{ '': false }] });
    expect(await test.contains('')).toBe(true);
    expect(test.observed.reads).toBe(0);
  } finally { test.sqlite.close(); }
});

it('rejects different scalars with the same byte length and advances across tree and row positions', async () => {
  const test = fixture();
  try {
    test.put(-3, { a: ['cat', 'dog'], nest: { fox: 'owl' } });
    test.put(4, { b: ['hen', 'bee'] });
    expect(await test.contains('eel')).toBe(false);
    expect(await test.contains('bee')).toBe(true);
    expect(await test.contains('fox')).toBe(true);
    expect(await test.contains('different length')).toBe(false);
  } finally { test.sqlite.close(); }
});

it('preserves SQLite rejection of malformed JSON', async () => {
  const test = fixture();
  try {
    test.sqlite.prepare('INSERT INTO node_sync_conflicts VALUES (?)').run('{bad json');
    await expect(test.contains('body')).rejects.toThrow('malformed JSON');
  } finally { test.sqlite.close(); }
});

it('rejects table/column combinations outside the existing JSON holder whitelist', async () => {
  const test = fixture();
  try {
    for (const invalid of [{ table: 'node_sync_conflicts', column: 'content' },
      { table: 'node_sync_conflicts; DROP TABLE nodes', column: 'snapshot_json' }]) {
      await expect(bodyJsonHolderContainsBody(test.db, invalid as BodyJsonHolder, identity('body')))
        .rejects.toThrow('body_holder_source_invalid');
    }
  } finally { test.sqlite.close(); }
});

it('hashes retained version JSON without requiring a physical body-state column', async () => {
  const test = fixture();
  const versionHolder = { table: 'node_sync_versions', column: 'snapshot_json' } as const;
  const body = '\ufeff' + '中😀\0文'.repeat(310_000);
  try {
    test.sqlite.exec('CREATE TABLE node_sync_versions (body_text TEXT, snapshot_json TEXT NOT NULL)');
    test.sqlite.prepare('INSERT INTO node_sync_versions VALUES (?, ?)')
      .run(null, JSON.stringify({ nested: [body] }));
    expect(await test.db.transaction(() =>
      bodyJsonHolderContainsBody(test.db, versionHolder, identity(body)))).toBe(true);
    expect(test.observed.maximumBytes).toBe(BODY_READ_CHUNK_BYTES);
  } finally { test.sqlite.close(); }
});

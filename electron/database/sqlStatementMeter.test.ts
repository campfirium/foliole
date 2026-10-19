// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { assertSqlQueryBudget, assertSqlScaleInvariant } from './sqlQueryBudget.testSupport.js';
import { measureSqlStatements } from './sqlStatementMeter.testSupport.js';

let db: Database.Database;

function seed(count: number) {
  db.exec('DELETE FROM items');
  const insert = db.prepare('INSERT INTO items (id, parent) VALUES (?, ?)');
  db.transaction(() => {
    for (let index = 0; index < count; index++) insert.run(`item-${index}`, 'root');
  })();
}

function readChildrenOneByOne() {
  const ids = db.prepare('SELECT id FROM items WHERE parent = ?').pluck().all('root') as string[];
  const byId = db.prepare('SELECT * FROM items WHERE id = ?');
  return ids.map((id) => byId.get(id));
}

function readChildrenTogether() {
  return db.prepare('SELECT * FROM items WHERE parent = ?').all('root');
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, parent TEXT)');
});

afterEach(() => db.close());

it('counts executed statements and rows read, ignoring transaction control', async () => {
  const { report, result } = await measureSqlStatements(() => {
    seed(3);
    return [...db.prepare('SELECT id FROM items').iterate()].length;
  });
  expect(result).toBe(3);
  expect(report.groups.map((group) => [group.sql, group.count, group.rows])).toEqual([
    ['INSERT INTO items (id, parent) VALUES (?, ?)', 3, 0],
    ['SELECT id FROM items', 1, 3],
    ['DELETE FROM items', 1, 0]
  ]);
  expect(report.statements).toBe(5);
  expect(report.rowsRead).toBe(3);
});

it('reports a per-row query loop as growing with library size', async () => {
  seed(3);
  const small = (await measureSqlStatements(readChildrenOneByOne)).report;
  seed(30);
  const large = (await measureSqlStatements(readChildrenOneByOne)).report;
  expect(() => assertSqlScaleInvariant('children', small, large, { allowRowGrowth: true }))
    .toThrow(/statements grew 4 -> 31[\s\S]*30x rows=30 SELECT \* FROM items WHERE id = \?/);
  expect(() => assertSqlQueryBudget('children', large, { maxRepeatsPerStatement: 1 }))
    .toThrow(/one statement ran 30x > 1/);
});

it('accepts a single batched read whose statement count does not grow', async () => {
  seed(3);
  const small = (await measureSqlStatements(readChildrenTogether)).report;
  seed(30);
  const large = (await measureSqlStatements(readChildrenTogether)).report;
  expect(() => assertSqlScaleInvariant('children', small, large, { allowRowGrowth: true })).not.toThrow();
  expect(() => assertSqlScaleInvariant('children', small, large)).toThrow(/rowsRead grew 3 -> 30/);
  expect(() => assertSqlQueryBudget('children', large, { maxStatements: 1, maxRepeatsPerStatement: 1 })).not.toThrow();
});

it('restores better-sqlite3 after measuring and rejects overlapping measurements', async () => {
  seed(2);
  await expect(measureSqlStatements(() => measureSqlStatements(() => 1))).rejects.toThrow(/cannot overlap/);
  const outside = await measureSqlStatements(() => undefined);
  db.prepare('SELECT * FROM items').all();
  expect(outside.report.statements).toBe(0);
  const statement = Object.getPrototypeOf(db.prepare('SELECT 1')) as { all: { name: string } };
  expect(statement.all.name).not.toBe('meteredStatement');
});

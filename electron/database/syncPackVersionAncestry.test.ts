// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { DbParams, DbRow } from '../../lib/core/sync/dbPort.js';
import { loadSyncPackVersionAncestry } from '../../lib/core/sync/syncPackVersionAncestry.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE node_sync_versions (version_id TEXT PRIMARY KEY, parent_version_id TEXT);
    CREATE TABLE node_sync_version_parents (version_id TEXT, parent_version_id TEXT,
      ordinal INTEGER, PRIMARY KEY (version_id, ordinal));`);
});

afterEach(() => db.close());

function insertVersion(id: string, legacy: string | null, parents: string[] = []) {
  db.prepare('INSERT INTO node_sync_versions VALUES (?, ?)').run(id, legacy);
  parents.forEach((parent, ordinal) => {
    db.prepare('INSERT INTO node_sync_version_parents VALUES (?, ?, ?)').run(id, parent, ordinal);
  });
}

it('does not materialize unrelated library history for a small incoming lineage', async () => {
  insertVersion('base', null);
  insertVersion('left', 'base');
  insertVersion('right', 'base', ['base']);
  insertVersion('head', 'obsolete-legacy', ['left', 'right']);
  db.transaction(() => {
    for (let index = 0; index < 10_000; index++) insertVersion(`unrelated-${index}`, null);
  })();
  const port = createBetterSqliteDbPort(db);
  const query = port.query.bind(port);
  let returnedRows = 0;
  port.query = async <T extends DbRow>(sql: string, params?: DbParams) => {
    const rows = await query<T>(sql, params);
    returnedRows += rows.length;
    return rows;
  };
  const ancestry = await loadSyncPackVersionAncestry(port, ['head']);
  expect(new Set(ancestry.ancestorIds('head'))).toEqual(new Set(['left', 'right', 'base']));
  expect(returnedRows).toBeLessThan(20);
});

it('pages high fan-out relations without losing parents or revisiting cycles', async () => {
  const parentIds = Array.from({ length: 300 }, (_, index) => `parent-${index}`);
  parentIds.forEach((id) => insertVersion(id, 'root'));
  insertVersion('root', null);
  insertVersion('head', null, parentIds);
  insertVersion('cycle-a', 'cycle-b');
  insertVersion('cycle-b', 'cycle-a');
  const port = createBetterSqliteDbPort(db);
  const query = port.query.bind(port);
  let largestResult = 0;
  port.query = async <T extends DbRow>(sql: string, params?: DbParams) => {
    const rows = await query<T>(sql, params);
    largestResult = Math.max(largestResult, rows.length);
    return rows;
  };
  const ancestry = await loadSyncPackVersionAncestry(port, ['head', 'cycle-a']);
  expect(new Set(ancestry.ancestorIds('head'))).toEqual(new Set([...parentIds, 'root']));
  expect(ancestry.ancestorIds('cycle-a')).toEqual(['cycle-b']);
  expect(largestResult).toBeLessThanOrEqual(128);
});

it('does no history read for an empty incoming set', async () => {
  insertVersion('unrelated', null);
  const port = createBetterSqliteDbPort(db);
  port.query = async () => { throw new Error('unexpected_history_read'); };
  const ancestry = await loadSyncPackVersionAncestry(port, []);
  expect(ancestry.ancestorIds('absent')).toEqual([]);
});

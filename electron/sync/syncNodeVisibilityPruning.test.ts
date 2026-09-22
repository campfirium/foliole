// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { pruneLearningRowsWithoutVisibleNodes } from '../../lib/core/sync/syncNodeVisibilityPruning.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

let sqlite: Database.Database;
const time = '2026-09-22T00:00:00.000Z';
const tables = ['node_reading_host_state', 'node_reading', 'node_review'];

beforeEach(() => {
  sqlite = new Database(':memory:');
  for (const sql of COMPANION_SCHEMA_STATEMENTS) sqlite.exec(sql);
});

afterEach(() => sqlite.close());

function node(id: string, parent: string | null, deleted = false) {
  sqlite.prepare(`INSERT INTO nodes
    (id, parent_id, title, content, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, parent, id, 'Readable body. '.repeat(300), time, time, deleted ? time : null);
}

function learning(id: string) {
  sqlite.prepare('INSERT INTO node_reading_host_state (node_id, host_name, updated_at) VALUES (?, ?, ?)')
    .run(id, 'phone', time);
  sqlite.prepare('INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES (?, ?, ?)').run(id, time, time);
  sqlite.prepare('INSERT INTO node_review (node_id, due) VALUES (?, ?)').run(id, time);
}

function remaining() {
  return tables.map((table) => sqlite.prepare(`SELECT node_id FROM ${table} ORDER BY node_id`).all());
}

it('retains visible learning records and removes descendants hidden by a deleted ancestor', async () => {
  node('root', null);
  node('visible', 'root');
  node('deleted', 'root', true);
  node('hidden', 'deleted');
  for (const id of ['visible', 'deleted', 'hidden']) learning(id);
  await pruneLearningRowsWithoutVisibleNodes(createBetterSqliteDbPort(sqlite));
  expect(remaining()).toEqual(tables.map(() => [{ node_id: 'visible' }]));
});

it('keeps a single version write from spending seconds pruning an unchanged 10k library', async () => {
  sqlite.transaction(() => {
    node('root', null);
    for (let index = 1; index < 10_000; index++) node(`node-${index}`, 'root');
    learning('node-1');
  })();
  const before = remaining();
  const started = performance.now();
  await pruneLearningRowsWithoutVisibleNodes(createBetterSqliteDbPort(sqlite));
  const elapsed = performance.now() - started;
  expect(remaining()).toEqual(before);
  expect(elapsed).toBeLessThan(1_000);
}, 30_000);

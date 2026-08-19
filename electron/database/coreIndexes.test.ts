// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-core-index-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { CORE_INDEX_NAMES } from '../../lib/core/database/coreIndexSchemaStatements.js';
import {
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseConnection
} from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-core-index-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('installs core indexes in fresh and migrated desktop databases', () => {
  const fresh = initializeDatabaseConnection(openDatabaseConnection());
  const freshIndexes = readCoreIndexNames(fresh.sqlite);
  closeDatabaseConnection();
  mockedAppDataDir = path.join(tempRoot, 'migrated-data');

  const migrated = openDatabaseConnection();
  createV38CoreTables(migrated.sqlite);
  migrated.sqlite.pragma('user_version = 38');
  initializeDatabaseConnection(migrated);

  expect(migrated.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(readCoreIndexNames(migrated.sqlite)).toEqual(freshIndexes);
  expect(freshIndexes).toEqual([...CORE_INDEX_NAMES].sort());
});

it('uses core indexes for high-risk review and sync queries', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());
  seedQueryPlanRows(connection.sqlite);

  expect(queryPlan(connection.sqlite, `SELECT node_id FROM node_review WHERE due <= ?`, ['2026-05-13T00:10:00.000Z']))
    .toContain('idx_node_review_due');
  expect(queryPlan(connection.sqlite, `SELECT op_id FROM review_log ORDER BY reviewed_at ASC, op_id ASC`))
    .toContain('idx_review_log_reviewed_at_op');
  expect(queryPlan(connection.sqlite, `SELECT op_id FROM review_log WHERE node_id IN (?, ?)`, ['node-1', 'node-2']))
    .toContain('idx_review_log_node_id');
  expect(queryPlan(connection.sqlite, `SELECT op_id FROM review_log WHERE host_name = ?`, ['Desktop host']))
    .toContain('idx_review_log_host_name');
  expect(queryPlan(
    connection.sqlite,
    `SELECT id FROM nodes
     WHERE sync_dirty = 1 OR current_version_id IS NULL
     ORDER BY updated_at ASC`
  )).toContain('idx_nodes_dirty_or_unversioned_updated');
  expect(queryPlan(connection.sqlite, `SELECT id FROM nodes WHERE body_blob_hash IS NOT NULL`))
    .toContain('idx_nodes_body_blob_hash');
}, 15000);

function readCoreIndexNames(sqlite: ReturnType<typeof openDatabaseConnection>['sqlite']) {
  return (sqlite
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'index' AND name IN (${CORE_INDEX_NAMES.map(() => '?').join(', ')})
       ORDER BY name ASC`
    )
    .all(...CORE_INDEX_NAMES) as Array<{ name: string }>).map((row) => row.name);
}

function queryPlan(sqlite: ReturnType<typeof openDatabaseConnection>['sqlite'], sql: string, args: unknown[] = []) {
  return (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args) as Array<{ detail: string }>)
    .map((row) => row.detail)
    .join('\n');
}

function createV38CoreTables(sqlite: ReturnType<typeof openDatabaseConnection>['sqlite']) {
  sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      body_blob_hash TEXT,
      current_version_id TEXT,
      sync_dirty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE node_review (
      node_id TEXT PRIMARY KEY,
      due TEXT NOT NULL
    );
    CREATE TABLE node_reading (
      node_id TEXT PRIMARY KEY,
      next_at TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE review_log (
      id TEXT PRIMARY KEY,
      op_id TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      reviewed_at TEXT NOT NULL
    );
  `);
}

function seedQueryPlanRows(sqlite: ReturnType<typeof openDatabaseConnection>['sqlite']) {
  const insertNode = sqlite.prepare(
    `INSERT INTO nodes (
      id, parent_id, kind, title, content, body_blob_hash, sync_dirty, updated_at, created_at, current_version_id
    ) VALUES (?, ?, 'topic', ?, '', ?, ?, ?, ?, ?)`
  );
  const insertReview = sqlite.prepare(
    `INSERT INTO node_review (node_id, due) VALUES (?, ?)`
  );
  const insertReading = sqlite.prepare(
    `INSERT INTO node_reading (node_id, last_handled_at, next_at, state) VALUES (?, ?, ?, ?)`
  );
  const insertLog = sqlite.prepare(
    `INSERT INTO review_log (
      id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at,
      due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
    ) VALUES (?, ?, ?, ?, 3, 'ts-fsrs@5.4.0 using FSRS-6.0', ?, ?, 1, 1, ?, 2, 2)`
  );

  for (let index = 0; index < 60; index += 1) {
    const nodeId = `node-${index}`;
    const timestamp = `2026-05-13T00:${String(index).padStart(2, '0')}:00.000Z`;
    insertNode.run(
      nodeId,
      index === 0 ? null : 'node-0',
      `Node ${index}`,
      index % 3 === 0 ? `blob-${index}` : null,
      index % 5 === 0 ? 1 : 0,
      timestamp,
      timestamp,
      index % 7 === 0 ? null : `desktop#${index}`
    );
    insertReview.run(nodeId, timestamp);
    insertReading.run(nodeId, timestamp, timestamp, index % 2 === 0 ? 'active' : 'paused');
    insertLog.run(`log-${index}`, `op-${index}`, index % 2 === 0 ? 'desktop' : 'android', nodeId, timestamp, timestamp, timestamp);
  }
}

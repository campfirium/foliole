// @vitest-environment node
/* global process */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../lib/core/database/migrations.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sqlite-maintenance-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('backs up and restores sqlite through the script entrypoint', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  const backupPath = path.join(tempRoot, 'backup.db');
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('journal_mode = WAL');
  initializeDatabaseSchema(sqlite);
  sqlite
    .prepare(
      `INSERT INTO nodes (
         id,
         parent_id,
         title,
         is_title_manual,
         content,
         reveal,
         anchor_link,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('node-1', null, 'node-1', 1, '# original', null, null, '2026-03-14T10:00:00.000Z', '2026-03-14T10:00:00.000Z', null);
  sqlite.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)').run('node-1', 0);
  sqlite.close();

  await runScript('backup', '--db-path', dbPath, '--destination-path', backupPath);
  await expect(fs.access(backupPath)).resolves.toBeUndefined();

  const mutated = new BetterSqlite3(dbPath);
  mutated.prepare('UPDATE nodes SET content = ? WHERE id = ?').run('# mutated', 'node-1');
  mutated.close();

  await runScript('restore', '--db-path', dbPath, '--source-path', backupPath);

  const restored = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  const row = restored.prepare('SELECT content FROM nodes WHERE id = ?').get('node-1');
  restored.close();

  expect(row).toEqual({ content: '# original' });
});

it('dry-runs search invalidation pruning without deleting rows', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  createSearchInvalidationDatabase(dbPath);

  const { stdout } = await runScript(
    'prune-search-invalidations',
    '--db-path',
    dbPath,
    '--retention-days',
    '7',
    '--older-than-iso',
    '2026-05-10T00:00:00.000Z'
  );

  expect(JSON.parse(stdout)).toEqual({
    command: 'prune-search-invalidations',
    dbPath,
    deletedRows: 0,
    failedRows: 1,
    matchedRows: 1,
    mode: 'dry-run',
    olderThanIso: '2026-05-10T00:00:00.000Z',
    pendingRows: 1,
    retentionDays: 7,
    runningRows: 1
  });
  expect(readInvalidationCounts(dbPath)).toEqual([
    { rows: 2, status: 'completed' },
    { rows: 1, status: 'failed' },
    { rows: 1, status: 'pending' },
    { rows: 1, status: 'running' }
  ]);
});

it('applies search invalidation pruning only to completed rows older than the boundary', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  createSearchInvalidationDatabase(dbPath);

  const { stdout } = await runScript(
    'prune-search-invalidations',
    '--db-path',
    dbPath,
    '--older-than-iso',
    '2026-05-10T00:00:00.000Z',
    '--apply'
  );

  expect(JSON.parse(stdout)).toMatchObject({
    deletedRows: 1,
    matchedRows: 1,
    mode: 'apply',
    olderThanIso: '2026-05-10T00:00:00.000Z'
  });
  expect(readInvalidationCounts(dbPath)).toEqual([
    { rows: 1, status: 'completed' },
    { rows: 1, status: 'failed' },
    { rows: 1, status: 'pending' },
    { rows: 1, status: 'running' }
  ]);
});

it('rejects invalid search invalidation pruning arguments', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  createSearchInvalidationDatabase(dbPath);

  await expect(runScript('prune-search-invalidations', '--db-path', dbPath, '--retention-days', '0'))
    .rejects.toMatchObject({ stderr: expect.stringContaining('--retention-days must be a positive integer') });
  await expect(runScript('prune-search-invalidations', '--db-path', dbPath, '--retention-days', '-1'))
    .rejects.toMatchObject({ stderr: expect.stringContaining('--retention-days must be a positive integer') });
  await expect(runScript('prune-search-invalidations', '--db-path', dbPath, '--retention-days', '1.5'))
    .rejects.toMatchObject({ stderr: expect.stringContaining('--retention-days must be a positive integer') });
  await expect(runScript('prune-search-invalidations', '--db-path', dbPath, '--retention-days', ''))
    .rejects.toMatchObject({ stderr: expect.stringContaining('missing value for --retention-days') });
  await expect(runScript('prune-search-invalidations', '--db-path', dbPath, '--older-than-iso', '2026-05-01'))
    .rejects.toMatchObject({ stderr: expect.stringContaining('--older-than-iso must be an ISO timestamp with timezone') });
});

async function runScript(...args) {
  return execFileAsync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/sqlite-maintenance.ts',
      ...args
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  );
}

function createSearchInvalidationDatabase(dbPath) {
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('journal_mode = WAL');
  initializeDatabaseSchema(sqlite);
  insertInvalidation(sqlite, 'completed', '2026-05-01T00:00:00.000Z');
  insertInvalidation(sqlite, 'completed', '2026-05-20T00:00:00.000Z');
  insertInvalidation(sqlite, 'pending', null);
  insertInvalidation(sqlite, 'running', null);
  insertInvalidation(sqlite, 'failed', null);
  sqlite.close();
}

function insertInvalidation(sqlite, status, completedAt) {
  sqlite
    .prepare(
      `INSERT INTO search_index_invalidations (
         invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
       ) VALUES ('node_workspace', ?, ?, 0, NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL, ?)`
    )
    .run(`target-${status}-${completedAt ?? 'none'}`, status, completedAt);
}

function readInvalidationCounts(dbPath) {
  const sqlite = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  const rows = sqlite
    .prepare('SELECT status, COUNT(*) AS rows FROM search_index_invalidations GROUP BY status ORDER BY status')
    .all();
  sqlite.close();
  return rows;
}

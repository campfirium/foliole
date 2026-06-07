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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sqlite-cleanup-main-fts-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('dry-runs legacy main FTS cleanup without snapshot or writes', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  createDatabaseWithLegacyMainFts(dbPath);

  const { stdout } = await runCleanup('--db-path', dbPath);
  const output = JSON.parse(stdout);

  expect(output).toMatchObject({
    command: 'cleanup-main-fts',
    dbPath,
    droppedTables: [],
    fileMayNotShrink: true,
    mode: 'dry-run',
    snapshot: null,
    status: 'needs-cleanup',
    vacuumed: false
  });
  expect(output.legacyObjectNamesBefore).toContain('node_search');
  expect(readLegacyMainFtsObjects(dbPath)).toContain('node_search');
  await expect(fs.access(path.join(tempRoot, 'foliole-maintenance-snapshots'))).rejects.toBeTruthy();
});

it('applies legacy main FTS cleanup with an explicit snapshot directory', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  const snapshotDir = path.join(tempRoot, 'operator-snapshots');
  createDatabaseWithLegacyMainFts(dbPath);

  const { stdout } = await runCleanup('--db-path', dbPath, '--snapshot-dir', snapshotDir, '--apply');
  const output = JSON.parse(stdout);

  expect(output).toMatchObject({
    command: 'cleanup-main-fts',
    dbPath,
    droppedTables: ['node_search', 'pdf_search'],
    fileMayNotShrink: false,
    mode: 'apply',
    status: 'cleaned',
    vacuumed: true
  });
  expect(output.legacyObjectNamesAfter).toEqual([]);
  expect(output.snapshot.destinationPath).toContain(snapshotDir);
  await expect(fs.access(output.snapshot.destinationPath)).resolves.toBeUndefined();
  expect(readLegacyMainFtsObjects(dbPath)).toEqual([]);
});

it('uses a database-local snapshot directory by default on apply', async () => {
  const dbPath = path.join(tempRoot, 'nested', 'foliole.db');
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  createDatabaseWithLegacyMainFts(dbPath);

  const { stdout } = await runCleanup('--db-path', dbPath, '--apply', '--no-vacuum');
  const output = JSON.parse(stdout);

  expect(output).toMatchObject({
    fileMayNotShrink: true,
    mode: 'apply',
    status: 'cleaned',
    vacuumed: false
  });
  expect(output.snapshot.destinationPath).toContain(path.join(path.dirname(dbPath), 'foliole-maintenance-snapshots'));
});

it('keeps already-clean apply free of snapshots', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  createDatabase(dbPath);

  const { stdout } = await runCleanup('--db-path', dbPath, '--apply');
  const output = JSON.parse(stdout);

  expect(output).toMatchObject({
    droppedTables: [],
    legacyObjectNamesAfter: [],
    legacyObjectNamesBefore: [],
    mode: 'apply',
    snapshot: null,
    status: 'already-clean',
    vacuumed: false
  });
  await expect(fs.access(path.join(tempRoot, 'foliole-maintenance-snapshots'))).rejects.toBeTruthy();
});

it('refuses the default live database path unless the second confirmation flag is present', async () => {
  await expect(runCleanup('--db-path', '/mnt/d/X/U/Foliole/Data/foliole.db', '--apply'))
    .rejects.toMatchObject({
      stderr: expect.stringContaining('"status":"refused-live-database"')
    });

  await expect(runCleanup(
    '--db-path',
    '/mnt/d/X/U/Foliole/Data/foliole.db',
    '--apply',
    '--i-understand-live-database'
  )).rejects.toMatchObject({
    stderr: expect.stringContaining('--i-have-current-backup')
  });
});

it('reports locked cleanup attempts with a machine-readable status', async () => {
  const dbPath = path.join(tempRoot, 'foliole.db');
  createDatabaseWithLegacyMainFts(dbPath);
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('locking_mode = EXCLUSIVE');
  sqlite.exec('BEGIN EXCLUSIVE');
  try {
    await expect(runCleanup('--db-path', dbPath, '--apply')).rejects.toMatchObject({
      stderr: expect.stringContaining('"status":"locked"')
    });
  } finally {
    sqlite.exec('ROLLBACK');
    sqlite.close();
  }
});

async function runCleanup(...args) {
  return execFileAsync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/sqlite-maintenance.ts',
      'cleanup-main-fts',
      ...args
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  );
}

function createDatabaseWithLegacyMainFts(dbPath) {
  const sqlite = createDatabase(dbPath);
  sqlite.exec(`
    CREATE VIRTUAL TABLE main.node_search USING fts5(
      title,
      path,
      content,
      node_id UNINDEXED,
      updated_at UNINDEXED,
      tokenize = 'trigram'
    );
    CREATE VIRTUAL TABLE main.pdf_search USING fts5(
      title,
      path,
      text,
      node_id UNINDEXED,
      attachment_id UNINDEXED,
      page UNINDEXED,
      updated_at UNINDEXED,
      page_text_length UNINDEXED,
      tokenize = 'trigram'
    );
  `);
  sqlite
    .prepare('INSERT INTO main.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Legacy', '', 'legacy body', 'node-1', '2026-05-27T00:00:00.000Z');
  sqlite
    .prepare('INSERT INTO main.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('Legacy PDF', '', 'legacy pdf body', 'node-1', 'attachment-1', '1', '2026-05-27T00:00:00.000Z', '15');
  sqlite.close();
}

function createDatabase(dbPath) {
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('journal_mode = WAL');
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

function readLegacyMainFtsObjects(dbPath) {
  const sqlite = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  try {
    return sqlite
      .prepare(
        `SELECT name
         FROM main.sqlite_master
         WHERE type IN ('table', 'index')
           AND (name = 'node_search'
             OR name LIKE 'node_search_%'
             OR name = 'pdf_search'
             OR name LIKE 'pdf_search_%')
         ORDER BY name`
      )
      .all()
      .map((row) => row.name);
  } finally {
    sqlite.close();
  }
}

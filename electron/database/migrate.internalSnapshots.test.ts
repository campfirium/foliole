// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let mockedAppDataDir = '/tmp/foliole-migration-snapshot-app-data';
let mockedDocumentsDir = '/tmp/foliole-migration-snapshot-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, resolveDatabasePath } from './connection.js';
import { resolveInternalDatabaseSnapshotDirectory } from './internalSnapshots.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-migration-snapshot-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates a pre-migration snapshot inside Backups before rejecting a legacy library database', async () => {
  const databasePath = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db');
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  createVersionTwelveDatabase(databasePath);

  await expect(async () => initializeDatabase()).rejects.toThrow(/delete the existing foliole\.db and rebuild/i);
  expect(resolveDatabasePath()).toBe(databasePath);

  const snapshotDirectory = resolveInternalDatabaseSnapshotDirectory(databasePath);
  const snapshotNames = await fs.readdir(snapshotDirectory);
  expect(snapshotNames).toHaveLength(1);
  expect(snapshotNames[0]?.startsWith('pre-migration-')).toBe(true);
});

function createVersionTwelveDatabase(databasePath: string) {
  const sqlite = new BetterSqlite3(databasePath);
  sqlite.exec(`CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    title TEXT NOT NULL,
    is_title_manual INTEGER NOT NULL DEFAULT 0,
    hide_title_heading INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    reveal TEXT,
    anchor_link TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`);
  sqlite.exec(`CREATE TABLE workspace_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  sqlite
    .prepare(
      `INSERT INTO nodes (
        id,
        parent_id,
        title,
        is_title_manual,
        hide_title_heading,
        content,
        reveal,
        anchor_link,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'legacy-node',
      null,
      'Legacy Node',
      1,
      0,
      '# legacy',
      null,
      null,
      '2026-03-30T00:00:00.000Z',
      '2026-03-30T00:00:00.000Z',
      null
    );
  sqlite.pragma('user_version = 12');
  sqlite.close();
}

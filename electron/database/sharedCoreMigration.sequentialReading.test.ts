// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-shared-core-sequential-reading-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  DATABASE_SCHEMA_VERSION,
  initializeDatabaseConnection
} from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-shared-core-sequential-reading-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('adds sequential reading column to existing v43 node tables', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id),
      kind TEXT NOT NULL DEFAULT 'topic',
      priority INTEGER,
      desired_retention REAL,
      enable_short_term INTEGER,
      title TEXT NOT NULL,
      is_title_manual INTEGER NOT NULL DEFAULT 0,
      hide_title_heading INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  connection.sqlite.pragma('user_version = 43');

  initializeDatabaseConnection(connection);

  const columns = connection.sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toContain('sequential_reading_enabled');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('adds manual child order column to existing v44 node tables', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id),
      kind TEXT NOT NULL DEFAULT 'topic',
      priority INTEGER,
      desired_retention REAL,
      enable_short_term INTEGER,
      sequential_reading_enabled INTEGER,
      title TEXT NOT NULL,
      is_title_manual INTEGER NOT NULL DEFAULT 0,
      hide_title_heading INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  connection.sqlite.pragma('user_version = 44');

  initializeDatabaseConnection(connection);

  const columns = connection.sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toContain('manual_child_order');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

it('adds shelved topic column to existing v45 node tables', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES nodes(id),
      kind TEXT NOT NULL DEFAULT 'topic',
      priority INTEGER,
      desired_retention REAL,
      enable_short_term INTEGER,
      sequential_reading_enabled INTEGER,
      manual_child_order TEXT,
      title TEXT NOT NULL,
      is_title_manual INTEGER NOT NULL DEFAULT 0,
      hide_title_heading INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  connection.sqlite.pragma('user_version = 45');

  initializeDatabaseConnection(connection);

  const columns = connection.sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
  expect(columns.map((column) => column.name)).toContain('shelved_at');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

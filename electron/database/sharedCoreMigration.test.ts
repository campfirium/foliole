// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-shared-core-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-shared-core-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('initializes schema through the shared core entry', () => {
  const connection = initializeDatabaseConnection(openDatabaseConnection());

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);

  const tables = connection.sqlite
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'import_runs', 'import_sources', 'keep_import_items', 'node_reading', 'nodes', 'settings', 'workspace_meta', 'node_view_state'
       )
       ORDER BY name ASC`
    )
    .all() as Array<{ name: string }>;

  expect(tables).toEqual([
    { name: 'import_runs' },
    { name: 'import_sources' },
    { name: 'keep_import_items' },
    { name: 'node_reading' },
    { name: 'node_view_state' },
    { name: 'nodes' },
    { name: 'settings' },
    { name: 'workspace_meta' }
  ]);
});

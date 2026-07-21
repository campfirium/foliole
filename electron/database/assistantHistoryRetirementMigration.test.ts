// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs'),
    documents_dir: mockedAppDataDir
  })
}));

import { ASSISTANT_THREAD_SCHEMA_STATEMENTS } from '../../lib/core/database/assistantThreadIndexSchemaStatements.js';

import { resolveManagedBackupDirectory } from './backupSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-aide-retirement-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('snapshots v57 Aide rows before v58 removes them from the main library', async () => {
  initializeDatabase();
  const legacy = openDatabaseConnection();
  for (const statement of ASSISTANT_THREAD_SCHEMA_STATEMENTS) legacy.sqlite.exec(statement);
  legacy.sqlite.prepare(
    `INSERT INTO assistant_thread_index (
      provider, provider_thread_id, agent_tool_version, location_type, title, preview,
      created_at, updated_at, last_opened_at
    ) VALUES ('codex-app-server', 'thread-old', 2, 'workspace', 'Old', 'Old', ?, ?, ?)`
  ).run('2026-07-20T00:00:00.000Z', '2026-07-20T00:00:00.000Z', '2026-07-20T00:00:00.000Z');
  legacy.sqlite.pragma('user_version = 57');
  closeDatabaseConnection();

  const migrated = initializeDatabase();
  expect(migrated.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'assistant_thread_%'"
  ).all()).toEqual([]);

  const backupDirectory = resolveManagedBackupDirectory();
  const snapshotName = (await fs.readdir(backupDirectory)).find((name) => name.startsWith('pre-migration-'));
  expect(snapshotName).toBeDefined();
  const snapshot = new BetterSqlite3(path.join(backupDirectory, snapshotName ?? ''), { readonly: true });
  try {
    expect(snapshot.prepare(
      'SELECT provider_thread_id FROM assistant_thread_index'
    ).get()).toEqual({ provider_thread_id: 'thread-old' });
  } finally {
    snapshot.close();
  }
});

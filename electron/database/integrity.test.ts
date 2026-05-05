// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-integrity-tests';
let mockedDocumentsDir = '/tmp/foliole-integrity-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, resolveDatabasePath } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-integrity-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('quarantines a malformed sqlite database and recreates an empty schema on initialize', async () => {
  const databasePath = resolveDatabasePath();
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  await fs.writeFile(databasePath, 'not-a-sqlite-database');

  const recoveredConnection = initializeDatabase();
  const recoveryDir = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'recovery');
  const recoveredEntries = await fs.readdir(recoveryDir);
  const recoveredDatabaseName = recoveredEntries.find((entry) => entry.endsWith('.db'));

  expect(recoveredConnection.sqlite.prepare('PRAGMA quick_check(1)').pluck().get()).toBe('ok');
  expect(recoveredConnection.sqlite.prepare('PRAGMA user_version').pluck().get()).toBe(DATABASE_SCHEMA_VERSION);
  expect(recoveredDatabaseName).toMatch(/^foliole-corrupt-.*\.db$/);
  expect(
    await fs.readFile(path.join(recoveryDir, recoveredDatabaseName ?? ''), 'utf8')
  ).toBe('not-a-sqlite-database');
});

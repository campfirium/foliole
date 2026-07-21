// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-assistant-tool-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-assistant-tool-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies the legacy metadata migration before retiring main-library assistant history', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`${legacyThreadIndexSchema()}
    INSERT INTO assistant_thread_index (
      provider, provider_thread_id, location_type, title, preview,
      created_at, updated_at, last_opened_at
    ) VALUES (
      'codex-app-server', 'thread-legacy', 'workspace', 'Legacy', 'Legacy',
      '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'
    );
  `);
  connection.sqlite.pragma('user_version = 56');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'assistant_thread_%'"
  ).all()).toEqual([]);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
});

function legacyThreadIndexSchema() {
  return `CREATE TABLE assistant_thread_index (
    provider TEXT NOT NULL,
    provider_thread_id TEXT NOT NULL,
    location_type TEXT NOT NULL,
    location_node_id TEXT,
    title TEXT NOT NULL,
    preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    read_state TEXT NOT NULL DEFAULT 'not_requested',
    read_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT,
    PRIMARY KEY (provider, provider_thread_id)
  );`;
}

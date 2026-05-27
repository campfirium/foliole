// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  readWorkspaceSearchSidecarRebuildStatus,
  rebuildWorkspaceSearchSidecar
} from '../../lib/core/database/workspaceSearchSidecar.js';

let mockedAppDataDir = '/tmp/foliole-workspace-search-sidecar-live-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-sidecar-live-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('rebuilds the attached sidecar for an explicit live search strategy', () => {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare('INSERT INTO search.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Old', '', 'old tokenizer row', 'old-node', '2026-05-26T00:00:00.000Z');

  expect(rebuildWorkspaceSearchSidecar(connection, { strategy: 'cjk-trigram' })).toMatchObject({
    status: 'ready',
    strategy: 'cjk-trigram',
    tokenizer: 'trigram'
  });
  expect(
    connection.sqlite
      .prepare("SELECT json_extract(value_json, '$.tokenizer') AS tokenizer FROM search.search_metadata WHERE key = 'schema'")
      .get()
  ).toEqual({ tokenizer: 'trigram' });
  expect(
    connection.sqlite.prepare("SELECT COUNT(*) AS count FROM search.node_search WHERE node_id = 'old-node'").get()
  ).toEqual({ count: 0 });
});

it('reads persisted live rebuild status from sidecar metadata', () => {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare(
      `INSERT INTO search.search_metadata (key, value_json, updated_at)
       VALUES ('last_rebuild_status', ?, '2026-05-26T00:00:00.000Z')
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
    )
    .run(JSON.stringify({ status: 'ready', strategy: 'cjk-trigram', tokenizer: 'trigram' }));

  expect(readWorkspaceSearchSidecarRebuildStatus(connection.sqlite)).toEqual({
    status: 'ready',
    strategy: 'cjk-trigram',
    tokenizer: 'trigram'
  });
});

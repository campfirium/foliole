// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadPresentSyncPackStateRows } from './syncPackRows.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-present-sync-state-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('lists backed states without loading review events or payload bodies', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Node', '', 'now', 'now')`);
  driver.execute(`INSERT INTO node_review (node_id, due, state)
    VALUES ('node-1', 'tomorrow', 0)`);
  driver.execute(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
    VALUES ('app_settings', 'user_space', 'windows', 'desktop', '*', '{"theme":"dark"}', 'hash', 'now')`);
  driver.execute(`INSERT INTO sync_object_state
    (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
    VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', 'now'),
      ('node_review', 'node-1', 2, 'review-hash', 'desktop', 'now'),
      ('setting', 'user_space:windows:desktop:*:app_settings', 3, 'hash', 'desktop', 'now'),
      ('setting', 'user_space:windows:desktop:*:missing', 4, 'old', 'desktop', 'now')`);
  const queries = vi.spyOn(driver, 'queryAll');

  expect(loadPresentSyncPackStateRows(driver, 0, 4).map((row) => row.state_seq)).toEqual([1, 2, 3]);
  expect(queries.mock.calls.some(([sql]) => String(sql).includes('FROM review_log'))).toBe(false);
  expect(queries.mock.calls.some(([sql]) => String(sql).includes('payload_json'))).toBe(false);
});

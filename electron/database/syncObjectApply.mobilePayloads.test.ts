// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-mobile-payloads-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjects } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-mobile-payloads-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
}

it('applies mobile snake_case learning payloads', () => {
  insertNode('node-1');

  applySyncObjects([{
    content_hash: 'hash-review-mobile',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: JSON.stringify({
      difficulty: 3.4,
      due: '2026-04-25T08:10:00.000Z',
      elapsed_days: 1,
      lapses: 0,
      last_review_at: '2026-04-22T08:10:00.000Z',
      reps: 4,
      scheduled_days: 3,
      stability: 2.8,
      state: 2
    }),
    updated_at: '2026-04-22T08:10:00.000Z'
  }]);

  expect(openDatabaseConnection().driver.queryOne<{
    last_review_at: string;
    scheduled_days: number;
    state: number;
  }>('SELECT last_review_at, scheduled_days, state FROM node_review WHERE node_id = ?', ['node-1']))
    .toEqual({
      last_review_at: '2026-04-22T08:10:00.000Z',
      scheduled_days: 3,
      state: 2
    });
});

// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-visibility-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadReadingProgress } from './readingProgress.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-visibility-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-22T08:00:00.000Z', '2026-04-22T08:00:00.000Z']
  );
}

function androidStateRecords(): NativeSyncObjectRecord[] {
  return [{
    content_hash: 'hash-reading-android',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      last_handled_at: '2026-04-22T08:10:00.000Z',
      next_at: '2026-04-23T08:10:00.000Z',
      reading_position: 9,
      state: 'locked'
    }),
    updated_at: '2026-04-22T08:10:00.000Z'
  }, {
    content_hash: 'hash-review-android',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: JSON.stringify({
      due: '2026-04-25T08:10:00.000Z',
      last_review_at: '2026-04-22T08:10:00.000Z',
      reps: 4,
      scheduled_days: 3,
      state: 2
    }),
    updated_at: '2026-04-22T08:11:00.000Z'
  }, {
    content_hash: 'hash-active-view-android',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test:active_node',
    object_type: 'view_state',
    payload_json: JSON.stringify({ active_node_id: 'node-1' }),
    updated_at: '2026-04-22T08:12:00.000Z'
  }, {
    content_hash: 'hash-node-view-android',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test:node:node-1',
    object_type: 'view_state',
    payload_json: JSON.stringify({
      node_id: 'node-1',
      scroll_top: 128,
      selection_from: 5,
      selection_to: 13,
      source: 'user-scroll'
    }),
    updated_at: '2026-04-22T08:13:00.000Z'
  }];
}

it('makes Android-applied reading and review visible while keeping view state device-private', async () => {
  insertNode('node-1');

  await expect(applySyncObjectsAsync(androidStateRecords())).resolves.toEqual([
    'node_reading:node-1',
    'node_review:node-1'
  ]);

  const workspaceSnapshot = loadWorkspaceSnapshot();
  expect(openDatabaseConnection().sqlite
    .prepare("SELECT value FROM workspace_meta WHERE key = 'active_node_id'")
    .get()).toBeUndefined();
  expect(workspaceSnapshot?.nodesById['node-1']?.reading).toMatchObject({
    readingPosition: 0,
    state: 'locked'
  });
  expect(workspaceSnapshot?.nodesById['node-1']?.review).toMatchObject({
    lastReviewAt: '2026-04-22T08:10:00.000Z',
    reps: 4,
    scheduledDays: 3,
    state: 2
  });

  expect(loadReadingProgress()).toEqual({
    activeNodeId: null,
    nodeViewStateById: {}
  });
  expect(openDatabaseConnection().sqlite
    .prepare('SELECT COUNT(*) AS count FROM node_view_state')
    .get()).toEqual({ count: 0 });
});

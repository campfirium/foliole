// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-reading-sync-tests';

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
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-reading-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function upsertReadingNode(reading: boolean) {
  upsertNodeSnapshot({
    nodeId: 'node-reading',
    parentNodeId: null,
    kind: 'item',
    title: 'node-reading',
    isTitleManual: true,
    content: '# node-reading',
    reveal: 'answer',
    anchorLink: null,
    reading: reading
      ? {
          intervalDurationMs: 0,
          intervalGrowthFactor: 1,
          lastHandledAt: '2026-03-06T00:00:00.000Z',
          nextAt: '2026-03-06T00:00:00.000Z',
          priority: 0,
          readingPosition: 0,
          repetitionCount: 0,
          state: 'dismissed'
        }
      : null,
    position: 0,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function getSyncObjectState() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT object_type, object_id, last_modified_by_device_id, deleted_at, sync_dirty
       FROM sync_object_state WHERE object_type = 'node_reading' AND object_id = 'node-reading'`
    )
    .get() as Record<string, unknown> | undefined;
}

function getNodeReadingRow() {
  return openDatabaseConnection().sqlite
    .prepare('SELECT node_id FROM node_reading WHERE node_id = ?')
    .get('node-reading') as Record<string, unknown> | undefined;
}

function countNodeReadingChanges() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_change_log
       WHERE object_type = 'node_reading' AND object_id = 'node-reading'`
    )
    .get() as { count: number };
}

it('writes sync object state for node reading snapshots and tombstones', () => {
  upsertReadingNode(true);

  const activeState = getSyncObjectState();

  expect(activeState).toMatchObject({ deleted_at: null, object_id: 'node-reading', sync_dirty: 1 });
  expect(String(activeState?.last_modified_by_device_id)).not.toBe('');
  expect(countNodeReadingChanges().count).toBe(0);

  upsertReadingNode(false);

  expect(getNodeReadingRow()).toBeUndefined();
  expect(getSyncObjectState()).toMatchObject({
    deleted_at: '2026-03-06T00:00:00.000Z',
    object_type: 'node_reading',
    sync_dirty: 1
  });
  expect(countNodeReadingChanges().count).toBe(0);
});

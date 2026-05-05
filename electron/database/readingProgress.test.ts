// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-reading-progress-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { initializeDatabase } from './migrate.js';
import { loadReadingProgress, saveReadingProgress } from './readingProgress.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-progress-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('desktop_device_id', '"desktop-test"', '2026-03-06T00:00:00.000Z');
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('returns empty reading progress shape when sqlite has no rows', () => {
  expect(loadReadingProgress()).toEqual({
    activeNodeId: null,
    nodeViewStateById: {}
  });
});

it('persists and loads active node and per-node view state from sqlite', () => {
  saveReadingProgress({
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 124,
        selectionFrom: 10,
        selectionTo: 18
      },
      {
        nodeId: 'node-2',
        scrollTop: 8,
        selectionFrom: null,
        selectionTo: null
      }
    ],
    updatedAt: '2026-03-06T10:00:00.000Z'
  });

  expect(loadReadingProgress()).toEqual({
    activeNodeId: 'node-2',
    nodeViewStateById: {
      'node-1': {
        scrollTop: 124,
        selectionFrom: 10,
        selectionTo: 18,
        source: 'user-scroll',
        updatedAt: '2026-03-06T10:00:00.000Z'
      },
      'node-2': {
        scrollTop: 8,
        selectionFrom: null,
        selectionTo: null,
        source: 'user-scroll',
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    }
  });
  expect(openDatabaseConnection().sqlite
    .prepare('SELECT device_id FROM node_view_state WHERE node_id = ?')
    .get('node-1')).toEqual({ device_id: 'desktop-test' });
});

it('persists close flush source and keeps newer user scroll rows', () => {
  saveReadingProgress({
    activeNodeId: 'node-1',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 200,
        selectionFrom: null,
        selectionTo: null
      }
    ],
    source: 'user-scroll',
    updatedAt: '2026-03-06T10:01:00.000Z'
  });
  saveReadingProgress({
    activeNodeId: 'node-1',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 10,
        selectionFrom: null,
        selectionTo: null
      }
    ],
    source: 'close-flush',
    updatedAt: '2026-03-06T10:00:00.000Z'
  });

  expect(openDatabaseConnection().sqlite
    .prepare('SELECT scroll_top, source FROM node_view_state WHERE node_id = ?')
    .get('node-1')).toEqual({ scroll_top: 200, source: 'user-scroll' });
});

it('does not let restore overwrite saved user reading positions', () => {
  saveReadingProgress({
    activeNodeId: 'node-1',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 200,
        selectionFrom: null,
        selectionTo: null
      }
    ],
    source: 'user-scroll',
    updatedAt: '2026-03-06T10:00:00.000Z'
  });
  saveReadingProgress({
    activeNodeId: 'node-1',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 10,
        selectionFrom: null,
        selectionTo: null
      }
    ],
    source: 'restore',
    updatedAt: '2026-03-06T10:01:00.000Z'
  });

  expect(openDatabaseConnection().sqlite
    .prepare('SELECT scroll_top, source FROM node_view_state WHERE node_id = ?')
    .get('node-1')).toEqual({ scroll_top: 200, source: 'user-scroll' });
});


it('writes sync object state for active node and node view states', () => {
  saveReadingProgress({
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-1',
        scrollTop: 124,
        selectionFrom: 10,
        selectionTo: 18
      },
      {
        nodeId: 'node-2',
        scrollTop: 8,
        selectionFrom: null,
        selectionTo: null
      }
    ],
    updatedAt: '2026-03-06T10:00:00.000Z'
  });

  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT object_id, last_modified_by_device_id, sync_dirty
       FROM sync_object_state WHERE object_type = 'view_state' ORDER BY object_id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  expect(rows.map((row) => row.object_id)).toEqual([
    'session_resume:windows:desktop:desktop-test:active_node',
    'session_resume:windows:desktop:desktop-test:node:node-1',
    'session_resume:windows:desktop:desktop-test:node:node-2'
  ]);
  expect(rows.every((row) => row.last_modified_by_device_id === 'desktop-test')).toBe(true);
  expect(rows.every((row) => row.sync_dirty === 1)).toBe(true);
  const changeCount = openDatabaseConnection().sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_change_log WHERE object_type = 'view_state'`
    )
    .get() as { count: number };
  expect(changeCount.count).toBe(0);
});

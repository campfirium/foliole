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

import { closeDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { initializeDatabase } from './migrate.js';
import { loadReadingProgress, saveReadingProgress } from './readingProgress.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-reading-progress-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
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
        updatedAt: '2026-03-06T10:00:00.000Z'
      },
      'node-2': {
        scrollTop: 8,
        selectionFrom: null,
        selectionTo: null,
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    }
  });
});

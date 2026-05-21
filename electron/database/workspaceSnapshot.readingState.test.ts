// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-snapshot-reading-state-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-snapshot-reading-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('hydrates locked reading state and sequential reading settings from sqlite', () => {
  upsertNodeSnapshot({
    nodeId: 'node-reading',
    parentNodeId: null,
    kind: 'topic',
    title: 'Reading node',
    isTitleManual: true,
    sequentialReadingEnabled: true,
    content: 'content:reading',
    reveal: null,
    anchorLink: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-18T00:00:00.000Z',
      nextAt: '2026-03-18T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'locked'
    },
    position: 0,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-reading']?.sequentialReadingEnabled).toBe(true);
  expect(snapshot?.nodesById['node-reading']?.reading?.state).toBe('locked');
});

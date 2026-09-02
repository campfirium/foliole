// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { resetNodeReviewState } from '../database/reviewMutations.js';

import { handleInvokeRequest } from './commands.js';

vi.mock('../database/connection.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../database/connection.js')>(),
  runWithDatabaseConnectionOwner: vi.fn((execute: () => unknown) => execute())
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getFocusedWindow: vi.fn(() => null)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({}),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./boot.js', () => ({
  appendBootEvent: vi.fn(),
  bootReport: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn() }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
}));
vi.mock('../database/reviewMutations.js', () => ({ applyReviewGrade: vi.fn(), resetNodeReviewState: vi.fn() }));
vi.mock('../database/workspaceSnapshot.js', () => ({ loadWorkspaceSnapshot: vi.fn().mockReturnValue(null) }));
vi.mock('../database/readingProgress.js', () => ({
  loadReadingProgress: vi.fn().mockReturnValue({
    activeNodeId: null,
    nodeViewStateById: {}
  }),
  saveReadingProgress: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createReadingProgressSnapshot() {
  return {
    activeNodeId: 'node-2',
    browseRootNodeId: 'special-home',
    nodeViewStateById: {
      'node-2': {
        scrollTop: 24,
        selectionFrom: 2,
        selectionTo: 6,
        source: 'user-scroll' as const,
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    }
  };
}

function createReadingProgressSaveArgs() {
  return {
    activeNodeId: 'node-2',
    browseRootNodeId: 'special-home',
    nodeViewStates: [{
      nodeId: 'node-2',
      scrollTop: 24,
      selectionFrom: 2,
      selectionTo: 6,
      updatedAt: '2026-03-06T09:30:00.000Z'
    }],
    updatedAt: '2026-03-06T10:00:00.000Z'
  };
}

it('handles reading progress storage commands', async () => {
  const snapshot = createReadingProgressSnapshot();
  const saveArgs = createReadingProgressSaveArgs();
  vi.mocked(loadReadingProgress).mockReturnValue(snapshot);

  await expect(handleInvokeRequest({ command: 'load_reading_progress' })).resolves.toEqual(snapshot);

  await expect(
    handleInvokeRequest({
      command: 'save_reading_progress',
      args: saveArgs
    })
  ).resolves.toBeNull();

  expect(saveReadingProgress).toHaveBeenCalledWith({
    ...saveArgs,
    source: 'user-scroll',
  });
});

it('rejects invalid reading progress payload', async () => {
  await expect(
    handleInvokeRequest({
      command: 'save_reading_progress',
      args: {
        activeNodeId: 'node-2',
        nodeViewStates: [{ nodeId: 'node-2', scrollTop: -1 }],
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    })
  ).rejects.toThrow('invalid argument: nodeViewStates[0].scrollTop');
});

it('handles relearn node storage command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'relearn_node',
      args: {
        nodeId: 'node-2'
      }
    })
  ).resolves.toBeNull();

  expect(resetNodeReviewState).toHaveBeenCalledWith('node-2');
});

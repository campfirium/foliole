// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { loadReadingProgress, saveReadingProgress } from '../database/readingProgress.js';
import { resetNodeReviewState } from '../database/reviewMutations.js';

import { handleInvokeRequest } from './commands.js';

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
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn() }));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn()
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

it('handles reading progress storage commands', async () => {
  vi.mocked(loadReadingProgress).mockReturnValue({
    activeNodeId: 'node-2',
    nodeViewStateById: {
      'node-2': {
        scrollTop: 24,
        selectionFrom: 2,
        selectionTo: 6,
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    }
  });

  await expect(handleInvokeRequest({ command: 'load_reading_progress' })).resolves.toEqual({
    activeNodeId: 'node-2',
    nodeViewStateById: {
      'node-2': {
        scrollTop: 24,
        selectionFrom: 2,
        selectionTo: 6,
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    }
  });

  await expect(
    handleInvokeRequest({
      command: 'save_reading_progress',
      args: {
        activeNodeId: 'node-2',
        nodeViewStates: [
          {
            nodeId: 'node-2',
            scrollTop: 24,
            selectionFrom: 2,
            selectionTo: 6
          }
        ],
        updatedAt: '2026-03-06T10:00:00.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(saveReadingProgress).toHaveBeenCalledWith({
    activeNodeId: 'node-2',
    nodeViewStates: [
      {
        nodeId: 'node-2',
        scrollTop: 24,
        selectionFrom: 2,
        selectionTo: 6
      }
    ],
    updatedAt: '2026-03-06T10:00:00.000Z'
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

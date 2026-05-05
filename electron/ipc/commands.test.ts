// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';
import {
  deleteNodesPermanently,
  replaceNodeOrder,
  restoreNodes,
  softDeleteNodes,
  upsertNodeSnapshot
} from '../database/nodeMutations.js';

import { handleInvokeRequest } from './commands.js';

const { defaultReviewSchedulerSettings, openExternal, syncAppMenuState } = vi.hoisted(() => ({
  defaultReviewSchedulerSettings: {
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    enableFuzz: false,
    enableShortTerm: false,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 5,
      queueMixRatio: { reading: 1, fsrs: 5 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.1, max: 1.5 }
    },
    updatedAt: '2026-03-06T00:00:00.000Z'
  },
  openExternal: vi.fn().mockResolvedValue(undefined),
  syncAppMenuState: vi.fn()
}));

const mockWindow = {
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
  maximize: vi.fn(),
  minimize: vi.fn(),
  unmaximize: vi.fn()
};

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal }
}));

vi.mock('./menu.js', () => ({ syncAppMenuState }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn()
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn().mockResolvedValue({ 'foliole-ui-font-preset': 'inter' }),
  saveAppSettingsState: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue(defaultReviewSchedulerSettings),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue({
    ...defaultReviewSchedulerSettings,
    desiredRetention: 0.8,
    updatedAt: '2026-03-06T00:05:00.000Z'
  })
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn().mockReturnValue({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} })
}));
vi.mock('../mirror/rebuildMirrorOutput.js', () => ({
  rebuildMirrorOutput: vi.fn()
}));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({
  scheduleMirrorSync: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow.isMaximized.mockReturnValue(false);
});

it('handles node mutation commands', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_content',
      args: {
        nodeId: 'node-1',
        parentNodeId: null,
        kind: 'topic',
        title: 'Node title',
        isTitleManual: false,
        content: '# Content',
        reveal: null,
        anchorLink: null,
        position: 1,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:01.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(upsertNodeSnapshot).toHaveBeenNthCalledWith(1, {
    nodeId: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    priority: null,
    desiredRetention: null,
    hideTitleHeading: false,
    title: 'Node title',
    isTitleManual: false,
    content: '# Content',
    virtualFilter: null,
    reveal: null,
    anchorLink: null,
    reading: null,
    position: 1,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:01.000Z'
  });

});

it('handles node reveal mutation command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'update_node_reveal',
      args: {
        nodeId: 'node-2',
        parentNodeId: 'node-1',
        kind: 'item',
        title: 'QA',
        isTitleManual: true,
        content: 'Question',
        reveal: 'Answer',
        anchorLink: { id: 'cloze-1', kind: 'cloze' },
        position: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:02.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(upsertNodeSnapshot).toHaveBeenCalledWith({
    nodeId: 'node-2',
    parentNodeId: 'node-1',
    kind: 'item',
    priority: null,
    desiredRetention: null,
    hideTitleHeading: false,
    title: 'QA',
    isTitleManual: true,
    content: 'Question',
    virtualFilter: null,
    reveal: 'Answer',
    anchorLink: { id: 'cloze-1', kind: 'cloze' },
    reading: null,
    position: 2,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:02.000Z'
  });

});

it('handles node order replacement command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'replace_node_order',
      args: { nodeIds: ['node-1', 'node-2'] }
    })
  ).resolves.toBeNull();
  expect(replaceNodeOrder).toHaveBeenCalledWith(['node-1', 'node-2']);
});

it('handles soft delete node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'soft_delete_nodes',
      args: {
        nodeIds: ['node-1', 'node-2'],
        deletedAt: '2026-03-06T00:00:00.000Z'
      }
    })
  ).resolves.toBeNull();

  expect(softDeleteNodes).toHaveBeenCalledWith({
    nodeIds: ['node-1', 'node-2'],
    deletedAt: '2026-03-06T00:00:00.000Z'
  });
});

it('handles restore node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'restore_nodes',
      args: {
        nodeIds: ['node-1']
      }
    })
  ).resolves.toBeNull();

  expect(restoreNodes).toHaveBeenCalledWith({
    nodeIds: ['node-1']
  });
});

it('handles permanent delete node command', async () => {
  await expect(
    handleInvokeRequest({
      command: 'delete_nodes_permanently',
      args: {
        nodeIds: ['node-3'],
        nodeOrder: ['node-1', 'node-2']
      }
    })
  ).resolves.toBeNull();

  expect(deleteNodesPermanently).toHaveBeenCalledWith({
    nodeIds: ['node-3'],
    nodeOrder: ['node-1', 'node-2']
  });
});

it('handles app path and fsrs commands', async () => {
  const resolveAppPathsRequest = { command: 'resolve_app_paths' } satisfies NativeInvokeRequest<'resolve_app_paths'>;

  await expect(handleInvokeRequest(resolveAppPathsRequest)).resolves.toEqual({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  });

  await expect(
    handleInvokeRequest({
      command: 'review_grade',
      args: {
        request: {
          card: {
            due: '2026-03-04T00:00:00.000Z',
            last_review: null,
            state: 0,
            stability: 0,
            difficulty: 0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0
          },
          rating: 'Good',
          now: '2026-03-04T00:00:00.000Z'
        }
      }
    })
  ).resolves.toEqual({ reviewed_at: '2026-03-04T00:00:00.000Z', card: {} });
});

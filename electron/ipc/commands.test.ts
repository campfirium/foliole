// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

import { handleInvokeRequest } from './commands.js';

const { defaultReviewSchedulerSettings, openExternal, syncAppMenuState } = vi.hoisted(() => ({
  defaultReviewSchedulerSettings: {
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
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

const mockWindow = { close: vi.fn(), isMaximized: vi.fn(() => false), maximize: vi.fn(), minimize: vi.fn(), unmaximize: vi.fn() };
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
  flushAllDirtyNodeSyncVersions: vi.fn(),
  moveNodes: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  updateNodeAnchorLinks: vi.fn(),
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
vi.mock('./boot.js', () => ({
  appendBootEvent: vi.fn(),
  bootReport: vi.fn().mockResolvedValue(undefined)
}));
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

it('handles app path and fsrs commands', async () => {
  await expect(handleInvokeRequest({ command: 'resolve_app_paths' } satisfies NativeInvokeRequest<'resolve_app_paths'>)).resolves.toEqual({
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

// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';
import { reviewGrade, reviewPreview } from './review.js';
import { notifyWorkspaceContentChanged } from './workspaceContentChangedEvents.js';

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
    app_cache_dir: '/cache',
    app_config_dir: '/config',
    app_data_dir: '/data',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
}));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn(),
  saveReviewSchedulerSettings: vi.fn()
}));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn(), bootReport: vi.fn() }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn(),
  reviewPreview: vi.fn()
}));
vi.mock('./workspaceContentChangedEvents.js', () => ({
  notifyWorkspaceContentChanged: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function reviewArgs(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      card: {
        due: '2026-03-04T00:00:00.000Z',
        last_review: null,
        state: 0 as const,
        stability: 1,
        difficulty: 2,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0
      },
      now: '2026-03-04T00:00:00.000Z',
      rating: 'Good',
      ...overrides
    }
  };
}

it('rejects malformed review grade args before grading', async () => {
  await expect(
    handleInvokeRequest({ command: 'review_grade', args: reviewArgs({ rating: 'Maybe' }) })
  ).rejects.toThrow('invalid argument: request.rating');

  expect(reviewGrade).not.toHaveBeenCalled();
});

it('rejects malformed review preview args before previewing', async () => {
  await expect(
    handleInvokeRequest({ command: 'review_preview', args: reviewArgs({ now: '' }) })
  ).rejects.toThrow('invalid argument: request.now');

  expect(reviewPreview).not.toHaveBeenCalled();
});

it('rejects invalid scheduler card state at the IPC boundary', async () => {
  await expect(
    handleInvokeRequest({
      command: 'review_grade',
      args: reviewArgs({
        card: {
          ...reviewArgs().request.card,
          state: 5
        }
      })
    })
  ).rejects.toThrow('invalid argument: request.card.state');

  expect(reviewGrade).not.toHaveBeenCalled();
});

it('rejects missing review request at the IPC boundary', async () => {
  await expect(handleInvokeRequest({ command: 'review_preview', args: {} })).rejects.toThrow(
    'invalid argument: request'
  );

  expect(reviewPreview).not.toHaveBeenCalled();
});

it('does not broadcast workspace content changed after review grading', async () => {
  vi.mocked(reviewGrade).mockReturnValue({
    card: reviewArgs().request.card,
    reviewed_at: '2026-03-04T00:00:00.000Z'
  });

  await handleInvokeRequest({ command: 'review_grade', args: reviewArgs() });

  expect(reviewGrade).toHaveBeenCalledTimes(1);
  expect(notifyWorkspaceContentChanged).not.toHaveBeenCalled();
});

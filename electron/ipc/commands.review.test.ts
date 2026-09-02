// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { applyReviewGrade } from '../database/reviewMutations.js';

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
vi.mock('../database/nodeMutations.js', () => ({
  deleteNodesPermanently: vi.fn(),
  replaceNodeOrder: vi.fn(),
  restoreNodes: vi.fn(),
  softDeleteNodes: vi.fn(),
  upsertNodeSnapshot: vi.fn(),
  upsertNodeSnapshots: vi.fn()
}));
vi.mock('../database/reviewMutations.js', () => ({
  applyReviewGrade: vi.fn()
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
vi.mock('./review.js', () => ({ reviewGrade: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('handles transactional review grade command', async () => {
  const args = {
    nodeId: 'node-2',
    grade: 3,
    reviewedAt: '2026-03-06T00:00:00.000Z',
    schedulerVersion: 'ts-fsrs@4:short',
    cardBefore: {
      due: '2026-03-06T00:00:00.000Z',
      last_review: null,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0
    },
    cardAfter: {
      due: '2026-03-10T00:00:00.000Z',
      last_review: '2026-03-06T00:00:00.000Z',
      state: 1,
      stability: 1.5,
      difficulty: 2.3,
      elapsed_days: 1,
      scheduled_days: 4,
      reps: 1,
      lapses: 0
    }
  };

  await expect(handleInvokeRequest({ command: 'apply_review_grade', args })).resolves.toBeNull();
  expect(applyReviewGrade).toHaveBeenCalledWith(args);
});

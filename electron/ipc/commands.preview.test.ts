// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { handleInvokeRequest } from './commands.js';
import { reviewPreview } from './review.js';

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
  upsertNodeSnapshot: vi.fn()
}));
vi.mock('../database/reviewMutations.js', () => ({ applyReviewGrade: vi.fn() }));
vi.mock('./storage.js', () => ({
  loadAppSettingsState: vi.fn(),
  saveAppSettingsState: vi.fn()
}));
vi.mock('./boot.js', () => ({ bootReport: vi.fn() }));
vi.mock('./review.js', () => ({
  reviewGrade: vi.fn(),
  reviewPreview: vi.fn().mockReturnValue({
    Again: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-04T00:05:00.000Z' } },
    Hard: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-04T00:10:00.000Z' } },
    Good: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-05T00:00:00.000Z' } },
    Easy: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-08T00:00:00.000Z' } }
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('handles review preview command', async () => {
  const args = {
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
      now: '2026-03-04T00:00:00.000Z'
    }
  };

  await expect(handleInvokeRequest({ command: 'review_preview', args })).resolves.toEqual({
    Again: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-04T00:05:00.000Z' } },
    Hard: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-04T00:10:00.000Z' } },
    Good: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-05T00:00:00.000Z' } },
    Easy: { reviewed_at: '2026-03-04T00:00:00.000Z', card: { due: '2026-03-08T00:00:00.000Z' } }
  });
  expect(reviewPreview).toHaveBeenCalledWith(args);
});

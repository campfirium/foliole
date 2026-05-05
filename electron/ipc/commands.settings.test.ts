// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { saveReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

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
  loadReviewSchedulerSettings: vi.fn().mockReturnValue({
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.9,
    maximumIntervalDays: 36500,
    enableFuzz: false,
    enableShortTerm: false,
    updatedAt: '2026-03-06T00:00:00.000Z'
  }),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue({
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true,
    updatedAt: '2026-03-06T00:05:00.000Z'
  })
}));
vi.mock('../database/reviewMutations.js', () => ({ applyReviewGrade: vi.fn() }));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

it('handles app settings storage commands', async () => {
  await expect(handleInvokeRequest({ command: 'load_app_settings_state' })).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });

  await expect(
    handleInvokeRequest({
      command: 'save_app_settings_state',
      args: {
        settings: {
          'foliole-ui-font-preset': 'source-sans'
        }
      }
    })
  ).resolves.toBeNull();

  await expect(handleInvokeRequest({ command: 'load_review_scheduler_settings' })).resolves.toMatchObject({
    desiredRetention: 0.9
  });

  await expect(
    handleInvokeRequest({
      command: 'save_review_scheduler_settings',
      args: {
        settings: {
          desiredRetention: 0.8,
          maximumIntervalDays: 180,
          enableFuzz: true,
          enableShortTerm: true
        }
      }
    })
  ).resolves.toMatchObject({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true
  });

  expect(saveReviewSchedulerSettings).toHaveBeenCalledWith({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true
  });
});

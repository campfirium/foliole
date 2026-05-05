// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

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
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn().mockReturnValue({
    detailsOpen: true,
    readwiseRootPath: '/tmp/readwise',
    readwiseSources: [],
    sources: [],
    updatedAt: '2026-03-25T00:00:00.000Z',
    version: 1
  }),
  saveImportManagerSettings: vi.fn().mockImplementation((settings) => ({
    ...settings,
    updatedAt: '2026-03-25T00:05:00.000Z',
    version: 1
  }))
}));
vi.mock('../reviewSchedulerSettings.js', () => ({
  loadReviewSchedulerSettings: vi.fn().mockReturnValue({
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
  }),
  saveReviewSchedulerSettings: vi.fn().mockReturnValue({
    algorithm: 'ts-fsrs@4.3.0',
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true,
    pushQueue: {
      defaultPriority: 5,
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingInitialIntervalMs: 24 * 60 * 60 * 1000,
      readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
    },
    updatedAt: '2026-03-06T00:05:00.000Z'
  })
}));
vi.mock('../database/reviewMutations.js', () => ({ applyReviewGrade: vi.fn() }));
vi.mock('./boot.js', () => ({ bootReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./review.js', () => ({ reviewGrade: vi.fn(), reviewPreview: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

async function expectAppAndImportSettingsCommands() {
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
  await expect(handleInvokeRequest({ command: 'load_import_manager_settings' })).resolves.toMatchObject({
    detailsOpen: true,
    readwiseRootPath: '/tmp/readwise'
  });
  await expect(
    handleInvokeRequest({
      command: 'save_import_manager_settings',
      args: {
        settings: {
          detailsOpen: false,
          readwiseRootPath: '/tmp/readwise-next',
          readwiseSources: [],
          sources: []
        }
      }
    })
  ).resolves.toMatchObject({
    detailsOpen: false,
    readwiseRootPath: '/tmp/readwise-next',
    updatedAt: '2026-03-25T00:05:00.000Z'
  });
}

async function expectReviewSchedulerCommands() {
  await expect(
    handleInvokeRequest({
      command: 'save_review_scheduler_settings',
      args: {
        settings: {
          desiredRetention: 0.8,
          maximumIntervalDays: 180,
          enableFuzz: true,
          enableShortTerm: true,
          pushQueue: {
            priorityRatio: 7,
            queueMixRatio: { reading: 2, fsrs: 4 },
            readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
          }
        }
      }
    })
  ).resolves.toMatchObject({
    desiredRetention: 0.8,
    maximumIntervalDays: 180,
    enableFuzz: true,
    enableShortTerm: true,
    pushQueue: {
      priorityRatio: 7,
      queueMixRatio: { reading: 2, fsrs: 4 },
      readingIntervalGrowthFactorRange: { min: 1.08, max: 1.42 }
    }
  });
}

it('handles app and import settings storage commands', async () => {
  await expectAppAndImportSettingsCommands();
});

it('handles review scheduler storage commands', async () => {
  await expect(handleInvokeRequest({ command: 'load_review_scheduler_settings' })).resolves.toMatchObject({
    desiredRetention: 0.9
  });
  await expectReviewSchedulerCommands();
});

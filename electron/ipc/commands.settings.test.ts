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
vi.mock('./libraryPaths.js', () => ({
  loadLibraryPathSettings: vi.fn().mockResolvedValue({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: '/library/Inbox',
    library_home: '/library',
    mirror: '/library/Mirror',
    updated_at: '2026-03-30T00:00:00.000Z'
  }),
  updateLibraryPathSetting: vi.fn().mockImplementation(({ location, path }) => ({
    assets_dir: '/library/Assets',
    data_dir: '/library/Data',
    database_path: '/library/Data/foliole.db',
    inbox: location === 'inbox' && path ? path : '/library/Inbox',
    library_home: location === 'library_home' && path ? path : '/library',
    mirror: location === 'mirror' && path ? path : '/library/Mirror',
    updated_at: '2026-03-30T00:05:00.000Z'
  }))
}));
vi.mock('../mirror/rebuildAttachmentLinks.js', () => ({
  rebuildMirrorAttachmentLinks: vi.fn().mockResolvedValue({
    scanned_document_count: 2,
    rewritten_document_count: 1,
    rewritten_link_count: 3,
    updated_at: '2026-03-30T00:20:00.000Z'
  })
}));
vi.mock('../import/importManagerSettings.js', () => ({
  loadImportManagerSettings: vi.fn().mockReturnValue({
    detailsOpen: true,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: ''
    },
    readwiseRootPath: '/tmp/readwise',
    readwiseSources: [],
    sources: [],
    titleStrategy: 'file_name',
    updatedAt: '2026-03-25T00:00:00.000Z',
    version: 4
  }),
  saveImportManagerSettings: vi.fn().mockImplementation((settings) => ({
    ...settings,
    updatedAt: '2026-03-25T00:05:00.000Z',
    version: 4
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

async function expectLibraryPathCommands() {
  await expect(handleInvokeRequest({ command: 'load_library_path_settings' })).resolves.toMatchObject({
    library_home: '/library',
    inbox: '/library/Inbox',
    mirror: '/library/Mirror'
  });
  await expect(handleInvokeRequest({ command: 'rebuild_mirror_attachment_links' })).resolves.toMatchObject({
    scanned_document_count: 2,
    rewritten_document_count: 1,
    rewritten_link_count: 3
  });
  await expect(
    handleInvokeRequest({
      command: 'update_library_path_setting',
      args: {
        location: 'mirror',
        path: '/mirror-vault'
      }
    })
  ).resolves.toMatchObject({
    mirror: '/mirror-vault'
  });
}

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
  await expectLibraryPathCommands();
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
          readwiseReaderConfig: {
            highlightsHeading: '## Highlights',
            highlightSeparator: '\\n\\n',
            importScope: 'all',
            newHighlightsHeading: '## New highlights added',
            noteKeyword: 'Note:',
            tagKeyword: 'Tags:',
            validatedAt: '2026-03-25T00:02:00.000Z'
          },
          readwiseRootPath: '/tmp/readwise-next',
          readwiseSources: [],
          sources: [],
          titleStrategy: 'heading'
        }
      }
    })
  ).resolves.toMatchObject({
    detailsOpen: false,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'all',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-25T00:02:00.000Z'
    },
    readwiseRootPath: '/tmp/readwise-next',
    titleStrategy: 'heading',
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

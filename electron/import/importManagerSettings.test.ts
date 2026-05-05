// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-manager-settings-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { loadImportManagerSettings, saveImportManagerSettings } from './importManagerSettings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-manager-settings-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

const IMPORT_MANAGER_SETTINGS_INPUT = {
  detailsOpen: false,
  readwiseReaderConfig: {
    highlightsHeading: '## Highlights',
    highlightSeparator: '\\n\\n',
    importScope: 'highlights_only',
    newHighlightsHeading: '## New highlights added',
    noteKeyword: 'Note:',
    tagKeyword: 'Tags:',
    validatedAt: '2026-03-25T00:02:00.000Z'
  },
  readwiseRootPath: '/tmp/readwise-root',
  readwiseSources: [
    {
      id: 'draft-import-source-1',
      kind: 'articles',
      primaryPath: '/tmp/readwise-root/Full Document Contents/Articles',
      highlightPath: '/tmp/readwise-root/Articles',
      highlightMode: 'split',
      keepPreview: {
        blockedCount: 0,
        discoveredCount: 2,
        failedCount: 0,
        newCount: 1,
        previewedAt: '2026-03-25T00:03:00.000Z',
        samples: [{ detail: 'New file will be imported when enabled.', sourcePath: 'one.md', status: 'new' }],
        unchangedCount: 1,
        updatedCount: 0
      },
      keepState: 'previewed'
    }
  ],
  sources: [
    {
      id: 'draft-import-source-101',
      primaryPath: '/tmp/source-a',
      highlightPath: '/tmp/highlight-a',
      highlightMode: 'split',
      keepPreview: null,
      keepState: 'draft'
    },
    {
      id: 'draft-import-source-105',
      primaryPath: '/tmp/source-b',
      highlightPath: '',
      highlightMode: 'merged',
      keepPreview: null,
      keepState: 'enabled'
    }
  ]
};

function expectNormalizedSavedSettings() {
  const saved = saveImportManagerSettings(IMPORT_MANAGER_SETTINGS_INPUT);
  expect(saved).toMatchObject({
    detailsOpen: false,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-25T00:02:00.000Z'
    },
    readwiseRootPath: '/tmp/readwise-root',
    readwiseSources: [
      {
        id: 'draft-import-source-1',
        kind: 'articles',
        primaryPath: '/tmp/readwise-root/Full Document Contents/Articles',
        highlightPath: '/tmp/readwise-root/Articles',
        keepState: 'previewed'
      },
      {
        kind: 'books'
      },
      {
        kind: 'tweets'
      },
      {
        kind: 'podcasts'
      }
    ],
    sources: [
      {
        id: 'draft-import-source-101',
        keepState: 'draft'
      },
      {
        id: 'draft-import-source-105',
        highlightMode: 'merged',
        highlightPath: '',
        keepState: 'enabled'
      }
    ]
  });
  expect(saved.updatedAt).toMatch(/T/);
}

function expectReloadedSettingsAfterRestart() {
  closeDatabaseConnection();
  initializeDatabase();

  expect(loadImportManagerSettings()).toMatchObject({
    detailsOpen: false,
    readwiseReaderConfig: {
      highlightsHeading: '## Highlights',
      highlightSeparator: '\\n\\n',
      importScope: 'highlights_only',
      newHighlightsHeading: '## New highlights added',
      noteKeyword: 'Note:',
      tagKeyword: 'Tags:',
      validatedAt: '2026-03-25T00:02:00.000Z'
    },
    readwiseRootPath: '/tmp/readwise-root',
    readwiseSources: [
      {
        id: 'draft-import-source-1',
        keepPreview: expect.objectContaining({
          discoveredCount: 2
        }),
        kind: 'articles'
      },
      {
        kind: 'books'
      },
      {
        kind: 'tweets'
      },
      {
        kind: 'podcasts'
      }
    ],
    sources: [
      {
        id: 'draft-import-source-101',
        primaryPath: '/tmp/source-a'
      },
      {
        id: 'draft-import-source-105',
        keepState: 'enabled'
      }
    ]
  });
}

it('persists import manager settings into sqlite and reloads them after restart', () => {
  expectNormalizedSavedSettings();
  expectReloadedSettingsAfterRestart();
});

it('falls back to the default import manager settings when the payload is missing', () => {
  expect(loadImportManagerSettings()).toEqual(createDefaultImportManagerSettings());
});

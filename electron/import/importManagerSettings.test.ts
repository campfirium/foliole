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
import { createImportManagerSettingsTestInput } from './importManagerSettings.testSupport.js';

let tempRoot = '';
const testSourceRoot = path.resolve('.tmp/artifacts/import-manager-settings-test-folders');
const IMPORT_MANAGER_SETTINGS_INPUT = createImportManagerSettingsTestInput(testSourceRoot);

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-manager-settings-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await Promise.all(['source-a', 'source-b', 'highlight-a'].map((name) =>
    fs.mkdir(path.join(testSourceRoot, name), { recursive: true })
  ));
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.rm(testSourceRoot, { recursive: true, force: true });
});

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
    titleStrategy: 'heading',
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
        actionMode: 'keep',
        archivePath: '',
        id: 'draft-import-source-101',
        keepState: 'draft'
      },
      {
        actionMode: 'delete',
        id: 'draft-import-source-105',
        highlightMode: 'merged',
        highlightPath: '',
        keepState: 'draft'
      }
    ]
  });
  expect(saved.updatedAt).toMatch(/T/);
  saveImportManagerSettings({
    ...saved,
    sources: saved.sources.map((source) => source.id === 'draft-import-source-105'
      ? { ...source, keepState: 'enabled' }
      : source)
  });
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
    titleStrategy: 'heading',
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
        actionMode: 'keep',
        archivePath: '',
        id: 'draft-import-source-101',
        primaryPath: path.join(testSourceRoot, 'source-a')
      },
      {
        actionMode: 'delete',
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
  expect(loadImportManagerSettings()).toMatchObject({
    ...createDefaultImportManagerSettings(),
    updatedAt: expect.any(String),
    watchedFoldersReady: true,
    watchedFoldersReason: 'ready'
  });
});

it('normalizes legacy move handling payloads to keep when loading', () => {
  const saved = saveImportManagerSettings({
    ...IMPORT_MANAGER_SETTINGS_INPUT,
    sources: [
      {
        actionMode: 'move',
        archivePath: '/tmp/archive-a',
        id: 'draft-import-source-101',
        primaryPath: '/tmp/source-a',
        highlightPath: '',
        highlightMode: 'merged',
        keepPreview: null,
        keepState: 'draft'
      }
    ]
  });

  expect(saved.sources).toEqual([
    expect.objectContaining({
      actionMode: 'keep',
      archivePath: '',
      id: 'draft-import-source-101'
    })
  ]);
});

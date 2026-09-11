// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { loadReadwiseApiCandidates, saveReadwiseApiCandidates } from './readwiseApiCandidateStage.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-tag-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('persists a tag-only candidate separately from highlight truth', () => {
  saveReadwiseApiCandidates('connection', [{
    destination: 'external',
    documentId: 'tag-only',
    exportCategory: null,
    hasHighlights: false,
    highlightIds: [],
    matchedImportTag: true,
    readerCategory: 'rss',
    status: 'pending',
    title: 'Tagged RSS'
  }]);

  expect(loadReadwiseApiCandidates('connection')).toEqual([
    expect.objectContaining({
      destination: 'external',
      hasHighlights: false,
      matchedImportTag: true
    })
  ]);
});

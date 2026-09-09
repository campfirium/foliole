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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-candidate-stage-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps Books first while preferring candidates that can complete sooner', () => {
  saveReadwiseApiCandidates('connection', [
    candidate('book-large', 'books', 360),
    candidate('article-small', 'articles', 1),
    candidate('book-small', 'books', 3)
  ]);

  expect(loadReadwiseApiCandidates('connection').map((item) => item.documentId)).toEqual([
    'book-small',
    'book-large',
    'article-small'
  ]);
});

function candidate(documentId: string, exportCategory: string, highlightCount: number) {
  return {
    destination: 'inbox' as const,
    documentId,
    exportCategory,
    hasHighlights: true,
    highlightIds: Array.from({ length: highlightCount }, (_, index) => `${documentId}-highlight-${index}`),
    readerCategory: null,
    status: 'pending' as const,
    title: null
  };
}

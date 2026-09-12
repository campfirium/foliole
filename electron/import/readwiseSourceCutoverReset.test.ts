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
import { createDefaultReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { restartReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
import { loadReadwiseApiCandidates, saveReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { restartIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-reset-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reuses a complete fetched candidate set instead of clearing it and downloading again', () => {
  const policy = createDefaultReadwiseAutoImportPolicy();
  restartReadwiseApiCandidateRun('connection', policy, '2026-09-09T00:00:00.000Z');
  saveReadwiseApiCandidates('connection', [{
    destination: 'inbox', documentId: 'document-1', exportCategory: null,
    hasHighlights: true, highlightIds: ['highlight-1'], matchedImportTag: false,
    noteIds: [], readerCategory: 'article', status: 'ready', title: 'Fetched'
  }]);

  restartIncompleteReadwiseSourceCutover({
    connectionRef: 'connection', policy, sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z'
  });

  expect(loadReadwiseApiCandidates('connection')).toHaveLength(1);
  expect(loadReadwiseSourceCutover()).toMatchObject({
    cohortDocumentIds: ['document-1'], phase: 'indexing', status: 'migration-in-progress'
  });
});

// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-library-path-migration-pause-app-data';
let mockedDocumentsDir = '/tmp/foliole-library-path-migration-pause-documents';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('./storage.js', () => ({ loadAppSettingsState: vi.fn().mockResolvedValue({}) }));
vi.mock('../externalSearchBackgroundRefreshRuntime.js', () => ({
  pauseExternalSearchBackgroundRefresh: vi.fn().mockResolvedValue(undefined)
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { pauseExternalSearchBackgroundRefresh } from '../externalSearchBackgroundRefreshRuntime.js';

import { updateLibraryPathSetting } from './libraryPaths.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-path-migration-pause-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
  vi.mocked(pauseExternalSearchBackgroundRefresh).mockClear();
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('pauses external search refresh before moving Library Home data', async () => {
  const nextLibraryHome = path.join(tempRoot, 'LibraryNext');

  await expect(updateLibraryPathSetting({ location: 'library_home', path: nextLibraryHome })).resolves.toMatchObject({
    library_home: nextLibraryHome
  });

  expect(pauseExternalSearchBackgroundRefresh).toHaveBeenCalled();
});

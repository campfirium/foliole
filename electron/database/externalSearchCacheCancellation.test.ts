// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-cache-cancel';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import { refreshExternalSearchIndexes } from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-search-cancel-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeTextFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

it('stops refresh when the task signal is already cancelled', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  await writeTextFile(path.join(libraryRoot, 'alpha.md'), 'alpha');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-cancelled'
    }
  ]);
  const controller = new AbortController();
  controller.abort();

  await expect(refreshExternalSearchIndexes(undefined, { taskContext: { signal: controller.signal } })).rejects.toThrow(
    'AbortError'
  );
});

// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-readwise-exclude';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { saveImportManagerSettings } from '../import/importManagerSettings.js';

import { closeDatabaseConnection } from './connection.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-readwise-exclude-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveExternalFolder(folderPath: string) {
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: folderPath,
      id: 'folder-1'
    }
  ]);
}

function saveReadwiseRoot(readwiseRoot: string) {
  saveImportManagerSettings({ readwiseRootPath: readwiseRoot });
}

it('rejects an external folder that points at the current Readwise root parent', () => {
  const vaultRoot = path.join(tempRoot, 'vault');
  const readwiseRoot = path.join(vaultRoot, 'Readwise');
  saveReadwiseRoot(readwiseRoot);

  expect(() => saveExternalFolder(vaultRoot)).toThrow(
    'Readwise Reader folder cannot overlap External source 1.'
  );
});

it('rejects an external folder that points inside the current Readwise root', () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const articlesRoot = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  saveReadwiseRoot(readwiseRoot);

  expect(() => saveExternalFolder(articlesRoot)).toThrow(
    'Readwise Reader folder cannot overlap External source 1.'
  );
});

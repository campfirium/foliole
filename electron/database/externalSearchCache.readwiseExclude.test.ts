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
import { rebuildExternalSearchIndexes, searchExternalDocuments } from './externalSearchCache.js';
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

async function writeTextFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

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

it('excludes the current Readwise root when an external folder points at its parent', async () => {
  const vaultRoot = path.join(tempRoot, 'vault');
  const readwiseRoot = path.join(vaultRoot, 'Readwise');
  await writeTextFile(path.join(vaultRoot, 'ordinary.md'), 'ordinary external content');
  await writeTextFile(
    path.join(readwiseRoot, 'Full Document Contents', 'Articles', 'readwise.md'),
    'duplicated readwise content'
  );
  saveReadwiseRoot(readwiseRoot);
  saveExternalFolder(vaultRoot);

  await rebuildExternalSearchIndexes();

  expect(searchExternalDocuments('ordinary').map((result) => result.id)).toContain(
    path.join(vaultRoot, 'ordinary.md')
  );
  expect(searchExternalDocuments('duplicated')).toEqual([]);
});

it('skips scanning when an external folder points inside the Readwise root', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const articlesRoot = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  await writeTextFile(path.join(articlesRoot, 'readwise.md'), 'readwise category content');
  saveReadwiseRoot(readwiseRoot);
  saveExternalFolder(articlesRoot);

  await rebuildExternalSearchIndexes();

  expect(searchExternalDocuments('category')).toEqual([]);
});

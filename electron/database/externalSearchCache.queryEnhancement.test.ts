// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-query-enhancement-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import {
  refreshExternalSearchIndexes,
  searchExternalDocuments
} from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-search-query-'));
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

it('keeps external document punctuation literal while adding uppercase boolean recall', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const questionPath = path.join(libraryRoot, 'question.md');
  const advancedPath = path.join(libraryRoot, 'advanced.md');
  const literalPath = path.join(libraryRoot, 'literal.md');
  await writeTextFile(questionPath, 'Plain question marker.');
  await writeTextFile(advancedPath, 'Atlas roadmap mentions Launch details later.');
  await writeTextFile(literalPath, 'Atlas and Launch appears as a literal phrase.');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-1'
    }
  ]);

  await refreshExternalSearchIndexes();

  expect(searchExternalDocuments('Question?').map((result) => result.id)).toContain(questionPath);
  expect(searchExternalDocuments('Atlas AND Launch').map((result) => result.id)).toContain(advancedPath);
  const lowercaseResults = searchExternalDocuments('Atlas and Launch').map((result) => result.id);
  expect(lowercaseResults).toContain(literalPath);
  expect(lowercaseResults).not.toContain(advancedPath);
});

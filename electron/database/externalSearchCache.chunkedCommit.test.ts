// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-chunked-commit';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { refreshExternalSearchIndexes } from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

const FOLDER_ID = 'folder-chunked';
const DOCUMENT_COUNT = 120;

let tempRoot = '';
let libraryRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-search-chunked-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  libraryRoot = path.join(tempRoot, 'library');
  initializeDatabase();
  await fs.mkdir(libraryRoot, { recursive: true });
  for (let index = 0; index < DOCUMENT_COUNT; index += 1) {
    await fs.writeFile(path.join(libraryRoot, `doc-${index}.md`), `# Doc ${index}\n\nchunked body ${index}`, 'utf8');
  }
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    excluded_dirs: [],
    folder_path: libraryRoot,
    id: FOLDER_ID
  }]);
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function countDocuments(isPresent: 0 | 1) {
  return (openDatabaseConnection().sqlite.prepare(
    'SELECT COUNT(*) AS count FROM external_documents WHERE folder_id = ? AND is_present = ?'
  ).get(FOLDER_ID, isPresent) as { count: number }).count;
}

async function refreshWhileSampling(isPresent: 0 | 1) {
  const samples = new Set<number>();
  const timer = setInterval(() => samples.add(countDocuments(isPresent)), 0);
  try {
    await refreshExternalSearchIndexes(FOLDER_ID);
  } finally {
    clearInterval(timer);
  }
  return [...samples];
}

const isPartial = (count: number) => count > 0 && count < DOCUMENT_COUNT;

it('lets the event loop run between commits while indexing a large folder', async () => {
  const samples = await refreshWhileSampling(1);

  expect(samples.some(isPartial)).toBe(true);
  expect(countDocuments(1)).toBe(DOCUMENT_COUNT);
  expect((openDatabaseConnection().sqlite.prepare(
    `SELECT COUNT(*) AS count FROM sync_object_state WHERE object_type = 'external_document' AND sync_dirty = 1`
  ).get() as { count: number }).count).toBe(DOCUMENT_COUNT);
});

it('lets the event loop run between commits while marking a large folder missing', async () => {
  await refreshExternalSearchIndexes(FOLDER_ID);
  for (let index = 0; index < DOCUMENT_COUNT; index += 1) {
    await fs.rm(path.join(libraryRoot, `doc-${index}.md`));
  }

  const samples = await refreshWhileSampling(0);

  expect(samples.some(isPartial)).toBe(true);
  expect(countDocuments(0)).toBe(DOCUMENT_COUNT);
  expect(countDocuments(1)).toBe(0);
});

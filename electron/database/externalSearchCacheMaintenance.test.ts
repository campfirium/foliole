// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-cache-maintenance';

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
import { recordOpenedExternalDocument } from './externalOpenedDocuments.js';
import { openExternalSearchCacheDatabase, closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { pruneExternalSearchCache } from './externalSearchCacheMaintenance.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-cache-maintenance-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('does not retain legacy opened-file cache rows when pruning external search cache', async () => {
  const filePath = path.join(tempRoot, 'opened.md');
  await fs.writeFile(filePath, '# Opened', 'utf8');
  await recordOpenedExternalDocument(filePath);

  pruneExternalSearchCache([]);

  const db = openExternalSearchCacheDatabase();
  expect(db.prepare('SELECT COUNT(*) AS count FROM external_search_documents').get()).toEqual({ count: 0 });
  expect(db.prepare('SELECT COUNT(*) AS count FROM external_search_fts').get()).toEqual({ count: 0 });
});

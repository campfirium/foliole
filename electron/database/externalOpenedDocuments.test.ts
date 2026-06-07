// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-opened-external-documents';

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
  loadOpenedExternalSearchBrowseEntries,
  loadOpenedExternalSearchFolder,
  recordOpenedExternalDocument,
  refreshOpenedExternalDocumentRows
} from './externalOpenedDocuments.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-opened-external-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeTextFile(filePath: string, content: string, modifiedAt: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  const modifiedDate = new Date(modifiedAt);
  await fs.utimes(filePath, modifiedDate, modifiedDate);
}

it('keeps recently opened external documents and shows archived copies when files disappear', async () => {
  const openedPath = path.join(tempRoot, 'opened', 'recent.md');
  await writeTextFile(openedPath, '# Recent\nOpened body', '2026-04-21T04:00:00.000Z');

  const entry = await recordOpenedExternalDocument(openedPath);

  expect(entry).toEqual(expect.objectContaining({
    absolute_path: openedPath,
    folder_id: 'opened-external-documents',
    is_present: true,
    title: 'Recent'
  }));
  expect(loadOpenedExternalSearchFolder()).toEqual(expect.objectContaining({
    document_count: 1,
    folder_path: 'Recent',
    id: 'opened-external-documents'
  }));

  await fs.unlink(openedPath);
  await refreshOpenedExternalDocumentRows();

  expect(loadOpenedExternalSearchBrowseEntries()).toEqual([
    expect.objectContaining({
      absolute_path: openedPath,
      is_present: false,
      opening_text: 'Opened body',
      title: 'Recent'
    })
  ]);
});

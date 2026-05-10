// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { upsertReadwiseSource } from '../../lib/core/database/readwiseSources.js';

let mockedAppDataDir = '/tmp/foliole-readwise-external-library';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadExternalSearchBrowseEntries, searchExternalDocuments } from './externalSearchCache.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-external-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('projects external Readwise sources into the external library', () => {
  upsertReadwiseSource(openDatabaseConnection().driver, {
    annotations: [{
      highlightId: 'highlight-1',
      readwiseBookId: 'book-1',
      text: 'Readwise highlight text'
    }],
    author: 'Readwise Author',
    category: 'article',
    readerDocumentId: 'reader-doc-1',
    readwiseBookId: 'book-1',
    sourceState: 'external',
    sourceUrl: 'https://example.com/readwise',
    tags: ['research'],
    title: 'Readwise Topic',
    updatedAt: '2026-05-10T01:00:00.000Z'
  });

  expect(loadExternalSearchBrowseEntries('managed-readwise-reader')).toEqual([
    expect.objectContaining({
      absolute_path: 'readwise://reader/reader-doc-1',
      file_name: 'Readwise Topic.md',
      folder_id: 'managed-readwise-reader',
      folder_path: 'Readwise',
      opening_text: 'Readwise highlight text',
      relative_path: 'article/Readwise Topic.md',
      title: 'Readwise Topic'
    })
  ]);
  expect(searchExternalDocuments('highlight')).toEqual([
    expect.objectContaining({
      externalMatch: expect.objectContaining({
        absolutePath: 'readwise://reader/reader-doc-1',
        folderId: 'managed-readwise-reader',
        folderPath: 'Readwise'
      }),
      id: 'readwise://reader/reader-doc-1',
      kind: 'external',
      title: 'Readwise Topic'
    })
  ]);
});

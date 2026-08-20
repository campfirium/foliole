// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-books-inventory-secondary-tests';
const sourceOwnerMock = vi.hoisted(() => ({
  canRunExternalSources: true
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: vi.fn(() => sourceOwnerMock.canRunExternalSources)
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBooksInventory } from './readwiseBooksInventoryLoad.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-books-secondary-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  sourceOwnerMock.canRunExternalSources = true;
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('returns an empty books inventory without scanning when this desktop is secondary', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const highlightDir = path.join(readwiseRoot, 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Primary Book.md'), '# Primary Book\n\n## Highlights\n', 'utf8');
  saveImportManagerSettings({
    readwiseRootPath: readwiseRoot,
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z'
    },
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath: highlightDir,
        id: 'draft-import-source-2',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'books',
        primaryPath: path.join(readwiseRoot, 'Full Document Contents', 'Books')
      }
    ]
  });

  const primaryInventory = await loadReadwiseBooksInventory();
  sourceOwnerMock.canRunExternalSources = false;
  await fs.writeFile(path.join(highlightDir, 'Secondary Only Book.md'), '# Secondary Only Book\n', 'utf8');

  const secondaryInventory = await loadReadwiseBooksInventory();

  expect(primaryInventory.books.map((book) => book.bookKey)).toContain('primary book');
  expect(secondaryInventory.books).toEqual([]);
  expect(secondaryInventory.books.map((book) => book.bookKey)).not.toContain('secondary only book');
});

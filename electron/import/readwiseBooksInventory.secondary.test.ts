// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-books-inventory-secondary-tests';
const primaryDeviceMock = vi.hoisted(() => ({
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
vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => primaryDeviceMock.canRunExternalSources)
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { loadReadwiseBooksInventory } from './readwiseBooksInventory.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-books-secondary-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  primaryDeviceMock.canRunExternalSources = true;
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('returns persisted readwise books without scanning or writing when this desktop is secondary', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const highlightDir = path.join(readwiseRoot, 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Primary Book.md'), '# Primary Book\n\n## Highlights\n', 'utf8');
  saveImportManagerSettings({ readwiseRootPath: readwiseRoot });

  const primaryInventory = await loadReadwiseBooksInventory();
  primaryDeviceMock.canRunExternalSources = false;
  await fs.writeFile(path.join(highlightDir, 'Secondary Only Book.md'), '# Secondary Only Book\n', 'utf8');

  const secondaryInventory = await loadReadwiseBooksInventory();

  expect(secondaryInventory.books).toEqual(primaryInventory.books);
  expect(secondaryInventory.books.map((book) => book.bookKey)).not.toContain('secondary only book');
});

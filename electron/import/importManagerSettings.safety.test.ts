// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-manager-safety-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-manager-safety-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('rejects watched folders that overlap the Readwise Reader folder', () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');

  expect(() =>
    saveImportManagerSettings({
      readwiseRootPath: readwiseRoot,
      sources: [
        {
          actionMode: 'keep',
          archivePath: '',
          id: 'draft-import-source-101',
          primaryPath: path.join(readwiseRoot, 'Full Document Contents'),
          highlightPath: '',
          highlightMode: 'merged',
          keepPreview: null,
          keepState: 'enabled'
        }
      ]
    })
  ).toThrow('Readwise Reader folder cannot overlap Watched folder 1.');
});

it('applies readwise root derived paths when saving only the root path', () => {
  const saved = saveImportManagerSettings({
    readwiseRootPath: '/tmp/readwise-root'
  });

  expect(saved.readwiseSources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'articles',
        primaryPath: '/tmp/readwise-root/Full Document Contents/Articles',
        highlightPath: '/tmp/readwise-root/Articles'
      }),
      expect.objectContaining({
        kind: 'books',
        primaryPath: '/tmp/readwise-root/Full Document Contents/Books',
        highlightPath: '/tmp/readwise-root/Books'
      })
    ])
  );
});

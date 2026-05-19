// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-reader-incremental-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-reader-incremental-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function seedReadwiseFixture() {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightPath = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(
    path.join(primaryPath, 'Highlighted.md'),
    ['## Metadata', '- Author: [[Ada]]', '', '## Full Document', 'Before important sentence after.'].join('\n'),
    'utf8'
  );
  await fs.writeFile(path.join(highlightPath, 'Highlighted.md'), '# Highlighted\n\n## Highlights\nimportant sentence\n', 'utf8');
  await fs.writeFile(path.join(primaryPath, 'Plain.md'), '# Plain\n\nNo sidecar highlights.\n', 'utf8');
  saveImportManagerSettings({
    readwiseReaderConfig: {
      enabled: true,
      highlightsHeading: '## Highlights',
      importScope: 'highlights_only',
      validatedAt: '2026-05-11T00:00:00.000Z',
      withHighlightsDestination: 'inbox',
      withoutHighlightsDestination: 'off'
    },
    readwiseRootPath: readwiseRoot,
    readwiseSources: [
      {
        highlightMode: 'split',
        highlightPath,
        id: 'draft-import-source-1',
        keepPreview: null,
        keepState: 'enabled',
        kind: 'articles',
        primaryPath
      }
    ]
  });
}

it('does not read unchanged Readwise article markdown during repeat sync', async () => {
  await seedReadwiseFixture();
  await expect(runReadwiseReaderImport()).resolves.toMatchObject({
    imported_count: 1,
    skipped_count: 1,
    status: 'completed'
  });
  const readFile = vi.spyOn(fs, 'readFile');
  await expect(runReadwiseReaderImport()).resolves.toMatchObject({
    imported_count: 0,
    skipped_count: 2,
    status: 'completed'
  });

  expect(readFile.mock.calls.map(([filePath]) => String(filePath)).filter((filePath) => filePath.endsWith('.md'))).toEqual([]);
  readFile.mockRestore();
});

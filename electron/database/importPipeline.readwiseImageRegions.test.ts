// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-readwise-image-regions-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { resetRemoteImagePipelineForTests } from '../attachments/remoteImagePipeline.js';
import { loadPreparedReadwiseImportRecord } from '../import/readwisePreparedImport.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-readwise-image-regions-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  resetRemoteImagePipelineForTests();
  vi.stubGlobal('fetch', vi.fn());
  initializeDatabase();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function parseAnchorLink(value: string | null) {
  return JSON.parse(value ?? '{}') as {
    locator?: { from: number; originalText: string; to: number };
  };
}

it('projects a localized image-only highlight into a full-image region', async () => {
  const readwiseRoot = await fs.mkdtemp(path.join(tempRoot, 'readwise-local-image-only-'));
  const fullDir = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightDir = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(fullDir, { recursive: true });
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.writeFile(path.join(fullDir, 'cover.png'), Buffer.from('cover-image'));
  await fs.writeFile(path.join(fullDir, 'image.md'), '# Image\n\n![Cover](cover.png)\n', 'utf8');
  await fs.writeFile(
    path.join(highlightDir, 'image.md'),
    '# Image\n\n## Highlights\n- ![Cover](cover.png) ([View Highlight](https://read.readwise.io/read/01image))\n',
    'utf8'
  );

  const prepared = await loadPreparedReadwiseImportRecord({
    adapterId: 'markdown_directory',
    filePath: path.join(fullDir, 'image.md'),
    kind: 'markdown',
    mtimeMs: 1,
    sizeBytes: 1,
    sourceName: 'image.md'
  }, {
    highlightDirectoryPath: highlightDir,
    highlightPolicy: 'reference_only',
    importedAt: '2026-05-13T00:00:00.000Z',
    kind: 'articles',
    readwiseConfig: createDefaultReadwiseReaderConfig()
  });
  const imported = runPreparedImport(prepared);
  const nodeRow = openDatabaseConnection().sqlite
    .prepare('SELECT content FROM nodes WHERE id = ?')
    .get(imported.nodeId as string) as { content: string };
  const childRow = openDatabaseConnection().sqlite
    .prepare('SELECT anchor_link, image_regions FROM nodes WHERE parent_id = ?')
    .get(imported.nodeId as string) as { anchor_link: string | null; image_regions: string | null };
  const locator = parseAnchorLink(childRow.anchor_link).locator;
  const imageRegions = JSON.parse(childRow.image_regions ?? 'null') as Array<{
    attachmentId: string;
    regions: Array<{ height: number; width: number; x: number; y: number }>;
  }> | null;

  expect(locator ? nodeRow.content.slice(locator.from, locator.to) : null).toBe(locator?.originalText);
  expect(locator?.originalText).toMatch(/^!\[Cover]\(asset:\/\/.+\.png\)$/);
  expect(imageRegions).toMatchObject([
    {
      regions: [
        {
          height: 1,
          width: 1,
          x: 0,
          y: 0
        }
      ]
    }
  ]);
  expect(imageRegions?.[0]?.attachmentId).toBeTruthy();
});

// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-sync-preview-unparsed-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { runReadwiseReaderImport } from './readwiseReaderImportRun.js';
import { previewReadwiseReaderImport } from './readwiseSyncPreview.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-unparsed-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps sidecar files with unparsed highlights at the top of preview entries', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightPath = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(path.join(primaryPath, 'Ready.md'), '# Ready\n\nBefore important sentence after.\n', 'utf8');
  await fs.writeFile(path.join(highlightPath, 'Ready.md'), '# Ready\n\n## Highlights\nimportant sentence\n', 'utf8');
  await fs.writeFile(path.join(primaryPath, 'Unparsed.md'), '# Unparsed\n\nBody text.\n', 'utf8');
  await fs.writeFile(path.join(highlightPath, 'Unparsed.md'), '# Unparsed\n\n## Highlights\n', 'utf8');
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

  const preview = await previewReadwiseReaderImport();

  expect(preview).toMatchObject({
    total_count: 2,
    with_highlights_count: 2,
    without_highlights_count: 0,
    write_count: 2
  });
  expect(preview.entries[0]).toMatchObject({
    destination: 'inbox',
    detected_highlight_count: 0,
    highlight_status: 'unparsed',
    highlight_type: 'with_highlights',
    open_path: path.join(highlightPath, 'Unparsed.md'),
    source_path: 'Unparsed.md',
    status: 'new'
  });
});

it('treats image-only sidecar highlights with alt text as parsed highlights', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightPath = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(path.join(primaryPath, 'Image.md'), '# Image\n\n![Cover](https://cdn.example.com/cover.jpg)\n', 'utf8');
  await fs.writeFile(
    path.join(highlightPath, 'Image.md'),
    '# Image\n\n## Highlights\n- ![Cover](https://cdn.example.com/cover.jpg) ([View Highlight](https://read.readwise.io/read/01image))\n',
    'utf8'
  );
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

  const preview = await previewReadwiseReaderImport();

  expect(preview).toMatchObject({
    total_count: 1,
    with_highlights_count: 1,
    write_count: 1
  });
  expect(preview.entries[0]).toMatchObject({
    detected_highlight_count: 1,
    destination: 'inbox',
    highlight_status: 'with_highlights',
    status: 'new'
  });
});

it('includes highlight sidecars without full document files in preview and import', async () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightPath = path.join(readwiseRoot, 'Articles');
  await fs.mkdir(primaryPath, { recursive: true });
  await fs.mkdir(highlightPath, { recursive: true });
  await fs.writeFile(path.join(primaryPath, 'Ready.md'), '# Ready\n\nUseful highlight.\n', 'utf8');
  await fs.writeFile(path.join(highlightPath, 'Ready.md'), '# Ready\n\n## Highlights\nUseful highlight.\n', 'utf8');
  await fs.writeFile(path.join(highlightPath, 'Orphan.md'), '# Orphan\n\n## Highlights\nOrphan highlight.\n', 'utf8');
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

  await expect(previewReadwiseReaderImport()).resolves.toMatchObject({
    total_count: 2,
    with_highlights_count: 2,
    write_count: 2
  });
  const preview = await previewReadwiseReaderImport();
  expect(preview.entries[0]).toMatchObject({
    destination: 'inbox',
    highlight_status: 'highlight_only',
    source_path: 'Orphan.md',
    status: 'new'
  });
  await expect(runReadwiseReaderImport()).resolves.toMatchObject({
    entry_count: 2,
    imported_count: 2,
    status: 'completed'
  });
  expect(
    openDatabaseConnection().sqlite
      .prepare(`SELECT title FROM nodes WHERE title = 'Orphan' AND deleted_at IS NULL`)
      .get()
  ).toBeTruthy();
});

// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-book-manual-download-tests';

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined)
}));
const primaryDeviceMock = vi.hoisted(() => ({
  canRunExternalSources: true
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal }
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

import { createReadwiseImportSources } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { saveImportManagerSettings } from './importManagerSettings.js';
import { openReadwiseBookDownload } from './readwiseBookManualActions.js';
import { buildReadwiseBookPlaceholderNodeId } from './readwiseBookNodes.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-book-manual-download-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  primaryDeviceMock.canRunExternalSources = true;
  initializeDatabase();
  openExternal.mockReset();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function saveEnabledReadwiseBooksSettings(readwiseRoot: string) {
  saveImportManagerSettings({
    readwiseReaderConfig: { ...createDefaultReadwiseReaderConfig(), enabled: true },
    readwiseRootPath: readwiseRoot,
    readwiseSources: createReadwiseImportSources(readwiseRoot).map((source) =>
      source.kind === 'books' ? { ...source, keepState: 'enabled' as const } : source
    )
  });
}

async function createBooksFixture(downloadMarkdown: string) {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  const highlightDir = path.join(readwiseRoot, 'Books');
  const fullDocumentDir = path.join(readwiseRoot, 'Full Document Contents', 'Books');
  await fs.mkdir(highlightDir, { recursive: true });
  await fs.mkdir(fullDocumentDir, { recursive: true });
  await fs.writeFile(path.join(highlightDir, 'Manual Book.md'), '# Manual Book\n', 'utf8');
  await fs.writeFile(path.join(fullDocumentDir, 'Manual Book.md'), downloadMarkdown, 'utf8');
  saveEnabledReadwiseBooksSettings(readwiseRoot);
}

it('extracts the current book download link and opens it through the host shell', async () => {
  await createBooksFixture([
    '# Manual Book',
    '',
    '## Metadata',
    '- Download URL: https://readwise.example.com/books/manual-book.epub',
    '',
    '## Full Document',
    'Waiting for EPUB.'
  ].join('\n'));

  const result = await openReadwiseBookDownload(buildReadwiseBookPlaceholderNodeId('manual book'));

  expect(result).toEqual({
    book_key: 'manual book',
    status: 'opened',
    title: 'Manual Book',
    url: 'https://readwise.example.com/books/manual-book.epub'
  });
  expect(openExternal).toHaveBeenCalledWith('https://readwise.example.com/books/manual-book.epub');
});

it('extracts the original file link from the readwise full document body and opens it through the host shell', async () => {
  await createBooksFixture([
    '# Manual Book',
    '',
    '## Full Document',
    'Waiting for EPUB.',
    '[Download original file →](https://readwise.io/reader/document_raw_content/287639057)'
  ].join('\n'));

  const result = await openReadwiseBookDownload(buildReadwiseBookPlaceholderNodeId('manual book'));

  expect(result).toEqual({
    book_key: 'manual book',
    status: 'opened',
    title: 'Manual Book',
    url: 'https://readwise.io/reader/document_raw_content/287639057'
  });
  expect(openExternal).toHaveBeenCalledWith('https://readwise.io/reader/document_raw_content/287639057');
});

it('does not open a non-web original file link through the host shell', async () => {
  await createBooksFixture([
    '# Manual Book',
    '',
    '## Metadata',
    '- Download URL: javascript:alert(1)',
    '',
    '## Full Document',
    'Waiting for EPUB.'
  ].join('\n'));

  const result = await openReadwiseBookDownload(buildReadwiseBookPlaceholderNodeId('manual book'));

  expect(result).toEqual({
    book_key: 'manual book',
    status: 'missing_link',
    title: 'Manual Book',
    url: null
  });
  expect(openExternal).not.toHaveBeenCalled();
});

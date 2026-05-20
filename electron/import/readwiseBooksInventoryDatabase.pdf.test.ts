// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-books-inventory-pdf-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { closeDatabaseConnection } from '../database/connection.js';
import { runPreparedImport } from '../database/importPipeline.js';
import { initializeDatabase } from '../database/migrate.js';

import { resolveImportStatus } from './readwiseBooksInventoryDatabase.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-books-inventory-pdf-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('treats imported PDF original files as completed readwise book imports', () => {
  const pdfPath = path.join(tempRoot, 'Manual Book.pdf');

  runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Manual Book\n\nLinked PDF source ready for the reader surface.',
      fileName: 'Manual Book.pdf',
      filePath: pdfPath,
      importedAt: '2026-05-20T00:00:00.000Z',
      kind: 'pdf',
      sourceLocator: pdfPath,
      sourceTrackingMode: 'untracked'
    })
  );

  expect(resolveImportStatus({ epubPath: pdfPath })).toBe('completed');
});

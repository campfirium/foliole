// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-epub-import-tracking-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { ensureTrackedImportTarget } from './epubImportTracking.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-import-tracking-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createPreparedRecord(): PreparedImportRecord {
  return {
    content: '# Book',
    contentFingerprint: 'content-1',
    degradedReason: null,
    hideTitleHeading: false,
    importedAt: '2026-04-25T09:00:00.000Z',
    matchedHighlights: [],
    nodeTitle: 'Book',
    provider: 'desktop_text_file',
    sourceFingerprint: 'epub-source-1',
    sourceKind: 'epub',
    sourceLocator: '/books/book.epub',
    sourceName: 'book.epub'
  };
}

function readSyncRows() {
  return {
    state: openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
      `SELECT sync_dirty
       FROM sync_object_state
       WHERE object_type = 'import_source' AND object_id = ?`,
      ['epub-source-1']
    )
  };
}

it('records EPUB import source tracking writes in sync state', () => {
  ensureTrackedImportTarget(createPreparedRecord(), 'node-book');

  const rows = readSyncRows();
  expect(rows.state).toEqual({ sync_dirty: 1 });
});

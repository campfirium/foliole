// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-source-sync-object-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-source-sync-object-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies Readwise source payloads through the generic sync object path', async () => {
  const record: NativeSyncObjectRecord = {
    content_hash: 'hash-readwise-source-1',
    deleted_at: null,
    object_id: 'reader-doc-1',
    object_type: 'readwise_source',
    payload_json: JSON.stringify({
      annotations: [{
        annotation_kind: 'highlight',
        highlight_id: 'highlight-1',
        parent_id: 'parent-1',
        readwise_book_id: 'book-1',
        text: 'Quote'
      }],
      reader_document_id: 'reader-doc-1',
      readwise_book_id: 'book-1',
      source_state: 'external',
      sync_cursor: 'cursor-1',
      sync_status: 'synced',
      title: 'Readwise article',
      updated_at: '2026-05-10T00:00:00.000Z'
    }),
    updated_at: '2026-05-10T00:00:00.000Z'
  };

  await expect(applySyncObjectsAsync([record])).resolves.toEqual(['readwise_source:reader-doc-1']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT source_id, title, sync_cursor FROM readwise_sources')).toEqual({
    source_id: 'reader-doc-1',
    sync_cursor: 'cursor-1',
    title: 'Readwise article'
  });
  expect(driver.queryOne('SELECT highlight_id, parent_id FROM readwise_source_annotations')).toEqual({
    highlight_id: 'highlight-1',
    parent_id: 'parent-1'
  });
});

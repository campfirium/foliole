// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-sources-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import {
  readReadwiseSource,
  toReadwiseSourceId,
  upsertReadwiseSourceWithSyncState
} from '../../lib/core/database/readwiseSources.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-sources-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('upserts one source per Reader document id', () => {
  const driver = openDatabaseConnection().driver;
  const base = {
    readerDocumentId: 'reader-doc-1',
    readwiseBookId: 'book-1',
    updatedAt: '2026-05-10T00:00:00.000Z'
  };

  const sourceId = upsertReadwiseSourceWithSyncState(driver, {
    ...base,
    annotations: [{ highlightId: 'highlight-1', parentId: 'parent-1', text: 'Quote' }],
    sourceState: 'external',
    syncCursor: 'cursor-1',
    syncStatus: 'synced',
    tags: ['tag-a'],
    title: 'First title'
  }, 'device-1');
  upsertReadwiseSourceWithSyncState(driver, {
    ...base,
    annotations: [{ annotationKind: 'note', highlightId: 'highlight-2', note: 'Note' }],
    internalNodeId: 'node-1',
    promotionLock: true,
    sourceState: 'internal',
    syncCursor: 'cursor-2',
    syncStatus: 'synced',
    title: 'Updated title'
  }, 'device-1');

  expect(sourceId).toBe(toReadwiseSourceId('reader-doc-1'));
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM readwise_sources')?.count).toBe(1);
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM readwise_source_annotations')?.count).toBe(1);
  expect(readReadwiseSource(driver, sourceId)).toMatchObject({
    annotations: [{ annotationKind: 'note', highlightId: 'highlight-2', note: 'Note', parentId: null }],
    internalNodeId: 'node-1',
    promotionLock: true,
    sourceState: 'internal',
    syncCursor: 'cursor-2',
    title: 'Updated title'
  });
  expect(driver.queryOne(
    'SELECT object_id FROM sync_object_state WHERE object_type = ? AND object_id = ?',
    ['readwise_source', sourceId]
  )).toEqual({ object_id: sourceId });
});

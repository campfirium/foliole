// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-body-consumer-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { buildReadwiseBookPlaceholderNodeId } from '../import/readwiseBookNodes.js';
import { refreshReadwiseBookPlaceholderNode } from '../import/readwiseBookPlaceholderRefresh.js';
import type { ReadwiseBookInventoryItem } from '../import/readwiseBooksInventory.js';
import { applyEpubSequentialReadingMode } from '../ipc/epubSequentialReading.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-body-consumers-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function seedNode(nodeId: string, content: string) {
  upsertNodeSnapshot({
    anchorLink: null, content, createdAt: '2026-08-01T00:00:00.000Z', isTitleManual: true,
    kind: 'topic', nodeId, parentNodeId: null, position: null, reveal: null, title: nodeId,
    updatedAt: '2026-08-01T00:00:00.000Z'
  });
}

function readBody(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<{ content: string; sync_dirty: number }>(
    'SELECT content, sync_dirty FROM nodes WHERE id = ?', [nodeId]);
}

it('normalizes a Readwise placeholder using its complete owned body', () => {
  const book = {
    annotationStatus: 'has_highlights', bodyState: 'unloaded', bookKey: 'book-one', downloadUrl: null,
    epubPath: null, epubStatus: 'missing', fullDocumentMarkdownPath: null,
    generatedNodeId: buildReadwiseBookPlaceholderNodeId('book-one'), highlightCount: 0,
    highlightMarkdownPath: null, highlightState: null, highlights: [], highlightUnmatchedCount: null,
    importStatus: 'completed', metadataFrontmatter: '', nodeStatus: 'generated', summary: null, title: 'Book One'
  } satisfies ReadwiseBookInventoryItem;
  seedNode(book.generatedNodeId, 'Old placeholder');
  openDatabaseConnection().driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', book.generatedNodeId]);

  openDatabaseConnection().sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  refreshReadwiseBookPlaceholderNode(book);

  const body = loadNodeBodyResolution(openDatabaseConnection().driver, book.generatedNodeId);
  expect(body?.status).toBe('resolved');
  if (body?.status !== 'resolved') throw new Error('placeholder body unavailable');
  expect(body.content).toContain('## Current status');
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    'SELECT sync_dirty FROM nodes WHERE id = ?', [book.generatedNodeId])?.sync_dirty).toBe(1);
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM content_blob_data')).toEqual([]);
  refreshReadwiseBookPlaceholderNode({ ...book, annotationStatus: 'no_highlights' });
  expect(readBody(book.generatedNodeId)?.content).toContain('## Current status');

});

it('uses complete owned EPUB bodies for free and sequential reading', () => {
  seedNode('epub-source', 'Source');
  seedNode('epub-section', 'Section body');
  seedNode('epub-second', 'Second section body');
  const driver = openDatabaseConnection().driver;
  openDatabaseConnection().sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  applyEpubSequentialReadingMode({
    driver, importedAt: '2026-08-01T00:01:00.000Z', mode: 'free',
    nodeIds: ['epub-second', 'epub-section'], sourceNodeId: 'epub-source'
  });
  expect(driver.queryOne<{ state: string }>('SELECT state FROM node_reading WHERE node_id = ?', ['epub-section']))
    .toEqual({ state: 'active' });

  applyEpubSequentialReadingMode({
    driver, importedAt: '2026-08-01T00:02:00.000Z', mode: 'sequential',
    nodeIds: ['epub-second', 'epub-section'], sourceNodeId: 'epub-source'
  });
  expect(readBody('epub-section')?.content).toBe('Section body');
  expect(readBody('epub-second')?.content).toBe('Second section body');
  expect(driver.queryOne<{ sequential_reading_enabled: number | null }>(
    'SELECT sequential_reading_enabled FROM nodes WHERE id = ?', ['epub-source']
  )).toEqual({ sequential_reading_enabled: 1 });

});

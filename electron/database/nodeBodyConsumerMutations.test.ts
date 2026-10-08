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
import { PDF_READER_PLACEHOLDER_TEXT } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { buildReadwiseBookPlaceholderNodeId } from '../import/readwiseBookNodes.js';
import { refreshReadwiseBookPlaceholderNode } from '../import/readwiseBookPlaceholderRefresh.js';
import type { ReadwiseBookInventoryItem } from '../import/readwiseBooksInventory.js';
import { applyEpubSequentialReadingMode } from '../ipc/epubSequentialReading.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { persistNodeResourceReference } from './nodeResources.js';
import { syncPdfBodyBlobsForReferenceNodes } from './pdfBodyBlobs.js';

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

it('refreshes an owned PDF placeholder and preserves the resulting version', () => {
  seedNode('pdf-node', `# PDF\n\n${PDF_READER_PLACEHOLDER_TEXT}`);
  persistNodeResourceReference('pdf-node', { storage_key: `${'a'.repeat(64)}.pdf`, role: 'reference', original_name: 'paper.pdf' });
  openDatabaseConnection().sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');

  expect(syncPdfBodyBlobsForReferenceNodes(
    'a'.repeat(64), [{ page: 1, text: 'Page body', pageHeight: null, pageWidth: null }],
    'test-host', '2026-08-01T00:01:00.000Z'
  )).toEqual(['pdf-node']);
  const body = readBody('pdf-node');
  expect(body?.content).toContain('Page body');
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM content_blob_data')).toEqual([]);
  expect(body?.sync_dirty).toBe(0);
  const connection = openDatabaseConnection();
  const head = connection.sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get('pdf-node');
  const version = connection.sqlite.prepare('SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?')
    .get(head) as { body_text: string; snapshot_json: string };
  expect(version.body_text).toContain('Page body');
  expect(JSON.parse(version.snapshot_json).resource_references).toContain('paper.pdf');

  const hash = openDatabaseConnection().driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['pdf-node']
  )?.body_blob_hash ?? '';
  openDatabaseConnection().driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(syncPdfBodyBlobsForReferenceNodes(
    'a'.repeat(64), [{ page: 1, text: 'Replacement', pageHeight: null, pageWidth: null }],
    'test-host', '2026-08-01T00:02:00.000Z'
  )).toEqual([]);
  expect(connection.sqlite.prepare('SELECT body_blob_hash FROM nodes WHERE id = ?').pluck().get('pdf-node')).toBe(hash);
  expect(connection.sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(head))
    .toContain('Page body');
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

it('preserves PDF selection and version hashes after legacy body caches are removed', () => {
  const attachmentId = 'b'.repeat(64);
  const bodies = [PDF_READER_PLACEHOLDER_TEXT.toUpperCase(),
    `large ${'中😀'.repeat(100_000)} ${PDF_READER_PLACEHOLDER_TEXT}`,
    `Before\0${PDF_READER_PLACEHOLDER_TEXT}`, 'Already extracted', PDF_READER_PLACEHOLDER_TEXT];
  const { driver, sqlite } = openDatabaseConnection();
  for (const [index, body] of bodies.entries()) {
    seedNode(`pdf-${index}`, body);
    persistNodeResourceReference(`pdf-${index}`, { storage_key: `${attachmentId}.pdf`,
      role: index === 4 ? 'image' : 'reference', original_name: 'paper.pdf' });
  }
  seedNode('pdf-deleted', PDF_READER_PLACEHOLDER_TEXT);
  persistNodeResourceReference('pdf-deleted', { storage_key: `${attachmentId}.pdf`, role: 'reference', original_name: 'paper.pdf' });
  driver.execute("UPDATE nodes SET deleted_at = 'deleted' WHERE id = 'pdf-deleted'");
  const now = '2026-08-01T00:01:00.000Z';
  const pages = [{ page: 2, text: ' Second ', pageHeight: null, pageWidth: null },
    { page: 1, text: ' First ', pageHeight: null, pageWidth: null }];
  const states = () => driver.queryAll<{ id: string; body_blob_hash: string; content_hash: string;
    parent_version_id: string; sync_dirty: number }>(`SELECT n.id, n.body_blob_hash, v.content_hash,
      v.parent_version_id, n.sync_dirty FROM nodes n JOIN node_sync_versions v
      ON v.version_id = n.current_version_id WHERE n.id IN ('pdf-0','pdf-1') ORDER BY n.id`);
  let expected: ReturnType<typeof states> = [];
  const rollback = new Error('comparison rollback');
  expect(() => driver.transaction(() => {
    expect(syncPdfBodyBlobsForReferenceNodes(attachmentId, pages, 'test-host', now)).toEqual(['pdf-0', 'pdf-1']);
    expected = states();
    throw rollback;
  })).toThrow(rollback);
  sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  expect(syncPdfBodyBlobsForReferenceNodes(attachmentId, [], 'test-host', now)).toEqual([]);
  expect(syncPdfBodyBlobsForReferenceNodes(attachmentId, pages, 'test-host', now)).toEqual(['pdf-0', 'pdf-1']);
  expect(states()).toEqual(expected);
  for (const id of ['pdf-0', 'pdf-1']) {
    expect(loadNodeBodyResolution(driver, id)).toMatchObject({ status: 'resolved', content: `# ${id}\n\nFirst\n\nSecond` });
  }
  expect(syncPdfBodyBlobsForReferenceNodes(attachmentId, pages, 'test-host', now)).toEqual([]);
  expect(states()).toEqual(expected);

});

it('preserves a complete extracted PDF body and its current version', () => {
  const attachmentId = 'c'.repeat(64);
  seedNode('pdf-large-extracted', 'Already extracted 中文😀'.repeat(20_000));
  persistNodeResourceReference('pdf-large-extracted', { storage_key: `${attachmentId}.pdf`, role: 'reference', original_name: 'paper.pdf' });
  const { driver, sqlite } = openDatabaseConnection();
  sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const read = () => driver.queryOne('SELECT content, body_blob_hash, current_version_id FROM nodes WHERE id = ?', ['pdf-large-extracted']);
  const before = read();
  expect(syncPdfBodyBlobsForReferenceNodes(attachmentId,
    [{ page: 1, text: 'Replacement', pageHeight: null, pageWidth: null }], 'test-host', 'now')).toEqual([]);
  expect(read()).toEqual(before);
});

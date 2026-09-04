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

import { PDF_READER_PLACEHOLDER_TEXT } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { buildReadwiseBookPlaceholderNodeId } from '../import/readwiseBookNodes.js';
import { refreshReadwiseBookPlaceholderNode } from '../import/readwiseBookPlaceholderRefresh.js';
import type { ReadwiseBookInventoryItem } from '../import/readwiseBooksInventory.js';
import { applyEpubSequentialReadingMode } from '../ipc/epubSequentialReading.js';

import { createAttachmentRecord, createNodeAttachmentLink } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
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
  return openDatabaseConnection().driver.queryOne<{ blob: string; content: string; sync_dirty: number }>(
    `SELECT CAST(cbd.data AS TEXT) AS blob, n.content, n.sync_dirty
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash WHERE n.id = ?`,
    [nodeId]
  );
}

it('normalizes a Readwise book placeholder through the formal Blob writer', () => {
  const book = {
    annotationStatus: 'has_highlights', bodyState: 'unloaded', bookKey: 'book-one', downloadUrl: null,
    epubPath: null, epubStatus: 'missing', fullDocumentMarkdownPath: null,
    generatedNodeId: buildReadwiseBookPlaceholderNodeId('book-one'), highlightCount: 0,
    highlightMarkdownPath: null, highlightState: null, highlights: [], highlightUnmatchedCount: null,
    importStatus: 'completed', metadataFrontmatter: '', nodeStatus: 'generated', summary: null, title: 'Book One'
  } satisfies ReadwiseBookInventoryItem;
  seedNode(book.generatedNodeId, 'Old placeholder');
  openDatabaseConnection().driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', book.generatedNodeId]);

  refreshReadwiseBookPlaceholderNode(book);

  const body = readBody(book.generatedNodeId);
  expect(body?.content).toContain('## Current status');
  expect(body?.blob).toBe(body?.content);
  expect(body?.sync_dirty).toBe(1);

  const hash = openDatabaseConnection().driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', [book.generatedNodeId]
  )?.body_blob_hash ?? '';
  openDatabaseConnection().driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(() => refreshReadwiseBookPlaceholderNode({ ...book, annotationStatus: 'no_highlights' }))
    .toThrow(`node_body_unavailable:${book.generatedNodeId}`);
});

it('refreshes a Blob-only PDF placeholder with matching Blob and inline projection', () => {
  seedNode('pdf-node', `# PDF\n\n${PDF_READER_PLACEHOLDER_TEXT}`);
  createAttachmentRecord({
    createdAt: '2026-08-01T00:00:00.000Z', id: 'pdf-attachment', mimeType: 'application/pdf',
    originalName: 'paper.pdf', sizeBytes: 100
  });
  createNodeAttachmentLink({ attachmentId: 'pdf-attachment', nodeId: 'pdf-node', role: 'reference' });
  openDatabaseConnection().driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', 'pdf-node']);

  expect(syncPdfBodyBlobsForReferenceNodes(
    'pdf-attachment', [{ page: 1, text: 'Page body', pageHeight: null, pageWidth: null }],
    'test-host', '2026-08-01T00:01:00.000Z'
  )).toEqual(['pdf-node']);
  const body = readBody('pdf-node');
  expect(body?.content).toContain('Page body');
  expect(body?.blob).toBe(body?.content);
  expect(body?.sync_dirty).toBe(1);

  const hash = openDatabaseConnection().driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['pdf-node']
  )?.body_blob_hash ?? '';
  openDatabaseConnection().driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(syncPdfBodyBlobsForReferenceNodes(
    'pdf-attachment', [{ page: 1, text: 'Replacement', pageHeight: null, pageWidth: null }],
    'test-host', '2026-08-01T00:02:00.000Z'
  )).toEqual([]);
  expect(readBody('pdf-node')?.content).toContain('Page body');
});

it('uses Blob-only EPUB candidates and aborts all reading writes for unavailable bodies', () => {
  seedNode('epub-source', 'Source');
  seedNode('epub-section', 'Section body');
  const driver = openDatabaseConnection().driver;
  driver.execute('UPDATE nodes SET content = ? WHERE id = ?', ['', 'epub-section']);
  applyEpubSequentialReadingMode({
    driver, importedAt: '2026-08-01T00:01:00.000Z', mode: 'free',
    nodeIds: ['epub-section'], sourceNodeId: 'epub-source'
  });
  expect(driver.queryOne<{ state: string }>('SELECT state FROM node_reading WHERE node_id = ?', ['epub-section']))
    .toEqual({ state: 'active' });

  const hash = driver.queryOne<{ body_blob_hash: string }>(
    'SELECT body_blob_hash FROM nodes WHERE id = ?', ['epub-section']
  )?.body_blob_hash ?? '';
  driver.execute('DELETE FROM content_blob_data WHERE hash = ?', [hash]);
  expect(() => applyEpubSequentialReadingMode({
    driver, importedAt: '2026-08-01T00:02:00.000Z', mode: 'sequential',
    nodeIds: ['epub-section'], sourceNodeId: 'epub-source'
  })).toThrow('node_body_unavailable:epub-section');
  expect(driver.queryOne<{ sequential_reading_enabled: number | null }>(
    'SELECT sequential_reading_enabled FROM nodes WHERE id = ?', ['epub-source']
  )).toEqual({ sequential_reading_enabled: 0 });
});

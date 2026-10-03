// @vitest-environment node

import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseSourceModeInitialized } from '../database/readwiseSourceMode.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { placeReadwisePdfHighlights, readReadwisePdfPages } from './readwisePdfPlacement.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-pdf-placement-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  ensureReadwiseSourceModeInitialized();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('moves only unique imported Readwise highlights onto the actual PDF without changing remote identity or notes', async () => {
  const document: PreparedReadwiseApiDocument = {
    annotations: [
      { content: 'alpha keyword\n※ Reader note', contentHash: 'h1', kind: 'highlight', locatorText: 'alpha keyword',
        parentRemoteId: 'document-1', remoteId: 'highlight-pdf-view', updatedAt: null },
      { content: 'keyword', contentHash: 'h2', kind: 'highlight', locatorText: 'keyword',
        parentRemoteId: 'document-1', remoteId: 'highlight-text-view', updatedAt: null }
    ],
    body: 'Reader converted text', category: 'pdf', coverImageUrl: null, degradedReason: null,
    id: 'document-1', metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null, title: 'PDF' },
    title: 'PDF', unmatchedAnnotationCount: 0, updatedAt: null
  };
  expect(materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef: 'connection', destination: 'inbox', document
  }).status).toBe('imported');
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  if (!source) throw new Error('missing imported source');
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const pages = await readReadwisePdfPages(bytes);
  placeReadwisePdfHighlights({ connectionRef: 'connection', documentId: 'document-1', nodeId: source.latest_node_id, pages });

  const placedId = stableReadwiseAnnotationNodeId('connection', 'highlight-pdf-view');
  const repeatedId = stableReadwiseAnnotationNodeId('connection', 'highlight-text-view');
  const placed = driver.queryOne<{ anchor_link: string; content: string }>('SELECT anchor_link, content FROM nodes WHERE id = ?', [placedId]);
  const repeated = driver.queryOne<{ anchor_link: string; content: string }>('SELECT anchor_link, content FROM nodes WHERE id = ?', [repeatedId]);
  expect(placed?.content).toBe('alpha keyword\n※ Reader note');
  expect(JSON.parse(placed?.anchor_link ?? '{}')).toMatchObject({
    kind: 'highlight', locator: { page: 1, rects: [expect.objectContaining({ width: expect.any(Number) })] }
  });
  expect(repeated?.content).toBe('keyword');
  expect(JSON.parse(repeated?.anchor_link ?? '{}')).not.toHaveProperty('locator');
  placeReadwisePdfHighlights({ connectionRef: 'connection', documentId: 'document-1', nodeId: source.latest_node_id, pages });
  expect(driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id = ?', [placedId])?.anchor_link)
    .toBe(placed?.anchor_link);
});

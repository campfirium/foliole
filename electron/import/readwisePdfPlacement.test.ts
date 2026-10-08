// @vitest-environment node

import { createHash } from 'node:crypto';
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

vi.mock('../database/pdfIndexing.js', () => ({
  enqueuePdfAttachmentIndexing: vi.fn(), markPdfAttachmentIndexPending: vi.fn()
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseSourceModeInitialized } from '../database/readwiseSourceMode.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { placeReadwisePdfHighlights, readReadwisePdfPages } from './readwisePdfPlacement.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-pdf-placement-'));
  appDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(appDataDir, 'assets'), libraryScope: 'test-library' });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  ensureReadwiseSourceModeInitialized();
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('places unique Readwise highlights on the actual PDF while preserving notes', async () => {
  const document = pdfDocumentFixture();
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  const originalFile = { bytes, state: { attachmentId: contentHash, contentHash, mimeType: 'application/pdf',
    reason: null, sizeBytes: bytes.byteLength, status: 'localized' as const } };
  const input = { config: createDefaultReadwiseReaderConfig(), connectionRef: 'connection',
    destination: 'inbox' as const, document, preparedResources: { epubImages: null, originalFile } };
  expect((await commitReadwiseApiDocument(input)).status).toBe('imported');
  const driver = openDatabaseConnection().driver;
  const source = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  if (!source) throw new Error('missing imported source');
  const pages = await readReadwisePdfPages(bytes);

  const placedId = stableReadwiseAnnotationNodeId('connection', 'highlight-pdf-view');
  const repeatedId = stableReadwiseAnnotationNodeId('connection', 'highlight-text-view');
  const placed = driver.queryOne<{ anchor_link: string; content: string }>('SELECT anchor_link, content FROM nodes WHERE id = ?', [placedId]);
  const repeated = driver.queryOne<{ anchor_link: string; content: string }>('SELECT anchor_link, content FROM nodes WHERE id = ?', [repeatedId]);
  expect(loadNodeBodyResolution(driver, placedId)).toMatchObject({ content: 'alpha keyword\n※ Reader note' });
  expect(JSON.parse(placed?.anchor_link ?? '{}')).toMatchObject({
    kind: 'highlight', locator: { page: 1, rects: [expect.objectContaining({ width: expect.any(Number) })] }
  });
  expect(loadNodeBodyResolution(driver, repeatedId)).toMatchObject({ content: 'keyword' });
  expect(JSON.parse(repeated?.anchor_link ?? '{}')).not.toHaveProperty('locator');
  expect((await commitReadwiseApiDocument({ ...input, preparedResources: { ...input.preparedResources,
    replaceOriginalFile: true, originalFile: { ...originalFile, bytes: null } } })).status).toBe('imported');
  expect(driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id = ?', [placedId])?.anchor_link)
    .toBe(placed?.anchor_link);
  const replacementBytes = Buffer.concat([bytes, Buffer.from('\n% replacement original\n')]);
  const replacementHash = createHash('sha256').update(replacementBytes).digest('hex');
  expect((await commitReadwiseApiDocument({ ...input, preparedResources: { ...input.preparedResources,
    replaceOriginalFile: true, originalFile: { bytes: replacementBytes, state: { ...originalFile.state,
      attachmentId: replacementHash, contentHash: replacementHash, sizeBytes: replacementBytes.byteLength } } } })).status).toBe('imported');
  const resources = driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id = ?', [source.latest_node_id]);
  expect(JSON.parse(resources?.resource_references ?? '[]')).toEqual([{
    storage_key: `${replacementHash}.pdf`, role: 'reference', original_name: 'PDF.pdf'
  }]);
  expect(await fs.readFile(path.join(appDataDir, 'assets', `${contentHash}.pdf`))).toEqual(bytes);
  expect(loadNodeBodyResolution(driver, source.latest_node_id)).toMatchObject({
    content: expect.stringContaining('Reader converted text')
  });
  driver.execute('DELETE FROM content_blob_data');
  driver.execute('UPDATE nodes SET anchor_link = NULL WHERE id = ?', [placedId]);
  placeReadwisePdfHighlights({ connectionRef: 'connection',
    documentId: 'document-1', nodeId: source.latest_node_id, pages });
  expect(driver.queryOne<{ anchor_link: string }>('SELECT anchor_link FROM nodes WHERE id = ?', [placedId])?.anchor_link)
    .toBe(placed?.anchor_link);

});

function pdfDocumentFixture(): PreparedReadwiseApiDocument {
  return {
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
}

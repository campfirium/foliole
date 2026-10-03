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

const mocks = vi.hoisted(() => ({ fetchRemote: vi.fn(), loadTarget: vi.fn(), snapshot: vi.fn() }));
vi.mock('./readwiseApiImportFetch.js', () => ({
  fetchReadwiseRawSourceDocument: (...args: unknown[]) => mocks.fetchRemote(...args)
}));
vi.mock('./readwiseSourceResyncTarget.js', () => ({
  loadReadwiseSourceResyncTarget: (...args: unknown[]) => mocks.loadTarget(...args),
  captureReadwiseSourceResyncSnapshot: (...args: unknown[]) => mocks.snapshot(...args),
  readReadwiseSourceResyncRuntimeStatus: () => 'ready'
}));
vi.mock('../database/pdfIndexing.js', () => ({
  enqueuePdfAttachmentIndexing: vi.fn(), markPdfAttachmentIndexPending: vi.fn()
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId, type PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { ensureReadwiseSourceModeInitialized } from '../database/readwiseSourceMode.js';
import { toNativeNodeSourceDetails } from '../ipc/nodeSourceDetailsPayload.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { getReadwisePdfOriginal, loadReadwisePdfOriginalActionState } from './readwisePdfOriginalAction.js';

let tempRoot = '';
let rootNodeId = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-pdf-original-'));
  appDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(appDataDir, 'assets'), libraryScope: 'test-library' });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  ensureReadwiseSourceModeInitialized();
  const document: PreparedReadwiseApiDocument = {
    annotations: [{ content: 'alpha keyword\n※ Note', contentHash: 'h1', kind: 'highlight',
      locatorText: 'alpha keyword', parentRemoteId: 'document-1', remoteId: 'highlight-1', updatedAt: null }],
    body: 'Reader text', category: 'pdf', coverImageUrl: null, degradedReason: null,
    id: 'document-1', metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null, title: 'PDF' },
    title: 'PDF', unmatchedAnnotationCount: 0, updatedAt: null
  };
  materializeReadwiseApiDocument({ config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection', destination: 'inbox', document });
  const driver = openDatabaseConnection().driver;
  rootNodeId = driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'document-1'"
  )!.latest_node_id;
  mocks.fetchRemote.mockReset();
  mocks.loadTarget.mockReset();
  mocks.snapshot.mockReset();
  mocks.snapshot.mockReturnValue('unchanged');
  mocks.loadTarget.mockReturnValue({
    connectionRef: 'connection', documentId: 'document-1', nodeId: rootNodeId,
    sourceFingerprint: 'fingerprint', state: { metadata: { category: 'pdf' }, originalFile: null }, title: 'PDF'
  });
  mocks.fetchRemote.mockResolvedValue({ category: 'pdf', id: 'document-1', rawSourceUrl: 'https://bucket.s3.amazonaws.com/original.pdf' });
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('downloads a real PDF to the existing Topic and persists its highlight position', async () => {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const fetchImpl = vi.fn(async () => new Response(bytes, {
    headers: { 'content-type': 'application/pdf' }, status: 200
  })) as typeof fetch;
  expect(loadReadwisePdfOriginalActionState(rootNodeId).status).toBe('ready');
  await expect(getReadwisePdfOriginal(rootNodeId, { fetchImpl })).resolves.toMatchObject({ status: 'completed' });
  const driver = openDatabaseConnection().driver;
  const root = driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id = ?', [rootNodeId]);
  expect(JSON.parse(root?.resource_references ?? '[]')).toEqual([
    expect.objectContaining({ role: 'reference', storage_key: expect.stringMatching(/\.pdf$/u) })
  ]);
  const source = driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id = 'document-1'"
  );
  expect(JSON.parse(source?.remote_import_state_json ?? '{}').originalFile.status).toBe('localized');
  expect(toNativeNodeSourceDetails(rootNodeId)?.import_source?.source_locator)
    .toMatch(/^foliole-asset:\/\/attachment\//u);
  const child = driver.queryOne<{ anchor_link: string; content: string }>(
    'SELECT anchor_link, content FROM nodes WHERE id = ?', [stableReadwiseAnnotationNodeId('connection', 'highlight-1')]
  );
  expect(child?.content).toBe('alpha keyword\n※ Note');
  expect(JSON.parse(child?.anchor_link ?? '{}').locator.page).toBe(1);
  closeDatabaseConnection();
  initializeDatabaseConnection(openDatabaseConnection());
  expect(toNativeNodeSourceDetails(rootNodeId)?.import_source?.source_locator)
    .toMatch(/^foliole-asset:\/\/attachment\//u);
  expect(JSON.parse(openDatabaseConnection().driver.queryOne<{ anchor_link: string }>(
    'SELECT anchor_link FROM nodes WHERE id = ?', [stableReadwiseAnnotationNodeId('connection', 'highlight-1')]
  )?.anchor_link ?? '{}').locator.page).toBe(1);
});

it('keeps the Topic and highlight unchanged when Readwise has no original', async () => {
  mocks.fetchRemote.mockResolvedValue({ category: 'pdf', id: 'document-1', rawSourceUrl: null });
  const driver = openDatabaseConnection().driver;
  const before = driver.queryOne<{ anchor_link: string | null; content: string }>(
    'SELECT anchor_link, content FROM nodes WHERE id = ?', [stableReadwiseAnnotationNodeId('connection', 'highlight-1')]
  );
  await expect(getReadwisePdfOriginal(rootNodeId)).resolves.toMatchObject({
    error_code: 'original_file_not_distributed', status: 'failed'
  });
  expect(driver.queryOne<{ anchor_link: string | null; content: string }>(
    'SELECT anchor_link, content FROM nodes WHERE id = ?', [stableReadwiseAnnotationNodeId('connection', 'highlight-1')]
  )).toEqual(before);
  expect(JSON.parse(driver.queryOne<{ resource_references: string }>(
    'SELECT resource_references FROM nodes WHERE id = ?', [rootNodeId]
  )?.resource_references ?? '[]')).toEqual([]);
});

it('places remote highlights during a new PDF import using its saved original', async () => {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const document: PreparedReadwiseApiDocument = {
    annotations: [{ content: 'beta keyword', contentHash: 'h2', kind: 'highlight',
      locatorText: 'beta keyword', parentRemoteId: 'document-2', remoteId: 'highlight-2', updatedAt: null }],
    body: 'Reader converted text', category: 'pdf', coverImageUrl: null, degradedReason: null,
    id: 'document-2', metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null, title: 'Second PDF' },
    title: 'Second PDF', unmatchedAnnotationCount: 0, updatedAt: null
  };
  const result = await commitReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef: 'connection', destination: 'inbox', document,
    preparedResources: { epubImages: null, originalFile: { bytes, state: {
      attachmentId: hash, contentHash: hash, mimeType: 'application/pdf', reason: null,
      sizeBytes: bytes.byteLength, status: 'localized'
    } } }
  });
  expect(result.status).toBe('imported');
  const driver = openDatabaseConnection().driver;
  const child = driver.queryOne<{ anchor_link: string }>(
    'SELECT anchor_link FROM nodes WHERE id = ?', [stableReadwiseAnnotationNodeId('connection', 'highlight-2')]
  );
  expect(JSON.parse(child?.anchor_link ?? '{}').locator.page).toBe(2);
});

it('places an incremental Readwise highlight on the already saved PDF without duplicating earlier highlights', async () => {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const fetchImpl = vi.fn(async () => new Response(bytes, {
    headers: { 'content-type': 'application/pdf' }, status: 200
  })) as typeof fetch;
  expect((await getReadwisePdfOriginal(rootNodeId, { fetchImpl })).status).toBe('completed');
  const document: PreparedReadwiseApiDocument = {
    annotations: [
      { content: 'alpha keyword\n※ Note', contentHash: 'h1', kind: 'highlight', locatorText: 'alpha keyword',
        parentRemoteId: 'document-1', remoteId: 'highlight-1', updatedAt: null },
      { content: 'gamma keyword', contentHash: 'h3', kind: 'highlight', locatorText: 'gamma keyword',
        parentRemoteId: 'document-1', remoteId: 'highlight-3', updatedAt: null }
    ],
    body: 'Reader text', category: 'pdf', coverImageUrl: null, degradedReason: null,
    id: 'document-1', metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null, title: 'PDF' },
    title: 'PDF', unmatchedAnnotationCount: 0, updatedAt: null
  };
  expect((await commitReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef: 'connection', destination: 'inbox', document
  })).status).toBe('imported');
  const driver = openDatabaseConnection().driver;
  const child = driver.queryOne<{ anchor_link: string }>(
    'SELECT anchor_link FROM nodes WHERE id = ?', [stableReadwiseAnnotationNodeId('connection', 'highlight-3')]
  );
  expect(JSON.parse(child?.anchor_link ?? '{}').locator.page).toBe(3);
  expect(driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [rootNodeId]
  )?.count).toBe(2);
});

it('does not attach a downloaded PDF after the Topic changes during the request', async () => {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const fetchImpl = vi.fn(async () => new Response(bytes, {
    headers: { 'content-type': 'application/pdf' }, status: 200
  })) as typeof fetch;
  mocks.snapshot.mockReturnValueOnce('before').mockReturnValueOnce('after');
  await expect(getReadwisePdfOriginal(rootNodeId, { fetchImpl })).resolves.toMatchObject({
    error_code: 'readwise_pdf_target_changed', status: 'failed'
  });
  const driver = openDatabaseConnection().driver;
  expect(JSON.parse(driver.queryOne<{ resource_references: string }>(
    'SELECT resource_references FROM nodes WHERE id = ?', [rootNodeId]
  )?.resource_references ?? '[]')).toEqual([]);
});

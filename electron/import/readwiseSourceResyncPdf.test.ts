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

const mocks = vi.hoisted(() => ({ fetchRemote: vi.fn(), prepareResync: vi.fn() }));
vi.mock('./readwiseApiImportFetch.js', () => ({
  fetchReadwiseRawSourceDocument: (...args: unknown[]) => mocks.fetchRemote(...args)
}));
vi.mock('./readwiseSourceResyncPreparation.js', () => ({
  prepareReadwiseSourceResync: (...args: unknown[]) => mocks.prepareResync(...args)
}));
vi.mock('./readwiseSourceResyncTarget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./readwiseSourceResyncTarget.js')>()),
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

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { resyncReadwiseSource } from './readwiseSourceResyncAction.js';

let tempRoot = '';
let rootNodeId = '';
const highlightId = () => stableReadwiseAnnotationNodeId('connection', 'highlight-1');

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-resync-pdf-'));
  appDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(appDataDir, 'assets'), libraryScope: 'test-library' });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  ensureReadwiseSourceModeInitialized();
  const document: PreparedReadwiseApiDocument = {
    annotations: [{ content: 'alpha keyword', contentHash: 'h1', kind: 'highlight',
      locatorText: 'alpha keyword', parentRemoteId: 'document-1', remoteId: 'highlight-1', updatedAt: null }],
    body: 'Reader text', category: 'pdf', coverImageUrl: null, degradedReason: null,
    id: 'document-1', metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null, title: 'PDF' },
    title: 'PDF', unmatchedAnnotationCount: 0, updatedAt: null
  };
  materializeReadwiseApiDocument({ config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection', destination: 'inbox', document });
  rootNodeId = openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'document-1'"
  )!.latest_node_id;
  mocks.fetchRemote.mockReset();
  mocks.prepareResync.mockReset();
  mocks.prepareResync.mockRejectedValue(new Error('reader_body_rebuild_requested'));
  mocks.fetchRemote.mockResolvedValue({ category: 'pdf', id: 'document-1', rawSourceUrl: 'https://bucket.s3.amazonaws.com/original.pdf' });
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function readTopic() {
  const driver = openDatabaseConnection().driver;
  return {
    body: driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', [rootNodeId])?.content,
    highlightAnchor: driver.queryOne<{ anchor_link: string | null }>(
      'SELECT anchor_link FROM nodes WHERE id = ?', [highlightId()]
    )?.anchor_link ?? null,
    originalFile: JSON.parse(driver.queryOne<{ remote_import_state_json: string }>(
      "SELECT remote_import_state_json FROM import_sources WHERE remote_document_id = 'document-1'"
    )?.remote_import_state_json ?? '{}').originalFile,
    references: JSON.parse(driver.queryOne<{ resource_references: string }>(
      'SELECT resource_references FROM nodes WHERE id = ?', [rootNodeId]
    )?.resource_references ?? '[]')
  };
}

it('reports a Readwise PDF without an original as a missing original instead of an unlinked PDF', async () => {
  const details = await toNativeNodeSourceDetails(rootNodeId);
  expect(details?.import_source).toMatchObject({ readwise_original_file: null, source_kind: 'pdf', source_locator: '' });
});

it('downloads the PDF original when resyncing a Readwise PDF without rebuilding the Reader body', async () => {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const fetchImpl = vi.fn(async () => new Response(bytes, {
    headers: { 'content-type': 'application/pdf' }, status: 200
  })) as typeof fetch;
  const before = readTopic();
  await expect(resyncReadwiseSource(rootNodeId, { fetchImpl })).resolves.toMatchObject({ status: 'completed' });
  const after = readTopic();
  expect(mocks.prepareResync).not.toHaveBeenCalled();
  expect(after.body).toBe(before.body);
  expect(after.originalFile.status).toBe('localized');
  expect(after.references).toEqual([
    expect.objectContaining({ role: 'reference', storage_key: expect.stringMatching(/\.pdf$/u) })
  ]);
  expect(JSON.parse(after.highlightAnchor ?? '{}').locator.page).toBe(1);
  expect((await toNativeNodeSourceDetails(rootNodeId))?.import_source).toMatchObject({
    readwise_original_file: expect.objectContaining({ status: 'localized' }),
    source_locator: expect.stringMatching(/^foliole-asset:\/\/attachment\//u)
  });
});

it('fails the resync and leaves the Topic unchanged when Readwise has no PDF original', async () => {
  mocks.fetchRemote.mockResolvedValue({ category: 'pdf', id: 'document-1', rawSourceUrl: null });
  const before = readTopic();
  await expect(resyncReadwiseSource(rootNodeId)).resolves.toMatchObject({
    error_code: 'original_file_not_distributed', status: 'failed'
  });
  expect(mocks.prepareResync).not.toHaveBeenCalled();
  expect(readTopic()).toEqual(before);
});

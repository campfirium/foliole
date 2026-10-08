// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(appDataDir, 'cache'), app_config_dir: path.join(appDataDir, 'config'),
  app_data_dir: appDataDir, app_log_dir: path.join(appDataDir, 'logs')
}) }));

vi.mock('../database/pdfIndexing.js', () => ({
  enqueuePdfAttachmentIndexing: vi.fn(), markPdfAttachmentIndexPending: vi.fn()
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadNodeResourceReferences } from '../database/nodeResources.js';
import { loadReadwiseApiFrozenResources } from '../database/readwiseApiFrozenResourceStage.js';

import { commitReadwiseApiDocument } from './readwiseApiDocumentCommit.js';
import { readReadwiseApiEpubBookBodies } from './readwiseApiEpubMaterialization.js';
import { epubFixture } from './readwiseApiEpubMaterialization.testSupport.js';
import { prepareReadwiseApiFrozenResources } from './readwiseApiFrozenBatch.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';

let root = '';
const flatBody = '\uFEFFOriginal 中文 😀\u0000';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-frozen-body-'));
  appDataDir = path.join(root, 'app-data');
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(appDataDir, 'assets'), libraryScope: 'test-library' });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});
afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('prepares and reopens frozen EPUB resources before committing the structure', async () => {
  const document = { ...epubFixture(), annotations: [] };
  const input = { config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection', destination: 'inbox' as const, document };
  materializeReadwiseApiDocument({ ...input, document: { ...document, body: flatBody, epubStructure: null } });
  const nodeId = sourceNodeId();
  const fetchImpl = vi.fn(async () => { throw new Error('unexpected_download'); });
  const assertCutoverBatch = vi.fn();
  const prepared = await prepareReadwiseApiFrozenResources({ ...input, dependencies: { fetchImpl, assertCutoverBatch } });
  expect(prepared.forceEpubStructure).toBe(true);
  expect(prepared.epubImages?.sections.map((section) => section.content))
    .toEqual(document.epubStructure!.sections.map((section) => section.content));
  expect(prepared.originalFile).toBeNull();
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, nodeId)).toMatchObject({ content: flatBody });
  expect(loadReadwiseApiFrozenResources('connection', document.id)).toEqual(prepared);
  const beforeChecks = assertCutoverBatch.mock.calls.length;
  closeDatabaseConnection();
  expect(await prepareReadwiseApiFrozenResources({ ...input, dependencies: { fetchImpl, assertCutoverBatch } })).toEqual(prepared);
  expect(assertCutoverBatch.mock.calls).toHaveLength(beforeChecks);
  expect((await commitReadwiseApiDocument({ ...input, preparedResources: prepared })).status).toBe('imported');
  const bodies = readReadwiseApiEpubBookBodies(nodeId);
  expect(bodies).toHaveLength(4);
  expect(bodies.slice(1).map((item) => item.content)).toEqual(document.epubStructure!.sections.map((section) => section.content));
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(openDatabaseConnection().sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('prepares resources from owned source content after legacy body caches are removed', async () => {
  const { driver, sqlite } = openDatabaseConnection();
  sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const input = { config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection', destination: 'inbox' as const, document: { ...epubFixture(), annotations: [] } };
  materializeReadwiseApiDocument({ ...input, document: { ...input.document, body: flatBody, epubStructure: null } });
  expect(loadNodeBodyResolution(driver, sourceNodeId())).toMatchObject({ content: flatBody });
  const fetchImpl = vi.fn(async () => { throw new Error('unexpected_download'); });
  const prepared = await prepareReadwiseApiFrozenResources({ ...input, dependencies: { fetchImpl } });
  expect(prepared.forceEpubStructure).toBe(true);
  expect(loadReadwiseApiFrozenResources('connection', input.document.id)).toEqual(prepared);
  expect(loadNodeBodyResolution(driver, sourceNodeId())).toMatchObject({ content: flatBody });
  expect(fetchImpl).not.toHaveBeenCalled();
});

function sourceNodeId() {
  const row = openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
    "SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'epub-1'"
  );
  if (!row) throw new Error('missing_source');
  return row.latest_node_id;
}

it('stages one verified PDF original and reuses it after reopening', async () => {
  const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const epub = epubFixture();
  const document = { ...epub, annotations: [], category: 'pdf', epubStructure: null,
    metadata: { ...epub.metadata, category: 'pdf' }, rawSourceUrl: 'https://bucket.s3.amazonaws.com/original.pdf' } satisfies PreparedReadwiseApiDocument;
  const input = { config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection', destination: 'inbox' as const, document };
  materializeReadwiseApiDocument(input);
  const nodeId = sourceNodeId();
  const fetchImpl = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    expect(new Headers(options?.headers).has('authorization')).toBe(false);
    return new Response(bytes, { headers: { 'content-type': 'application/pdf' } });
  });
  const prepared = await prepareReadwiseApiFrozenResources({ ...input, dependencies: { fetchImpl } });
  expect(prepared.originalFile).toEqual({ bytes: null, state: { attachmentId: hash, contentHash: hash,
    mimeType: 'application/pdf', reason: null, sizeBytes: bytes.byteLength, status: 'localized' } });
  expect(await fs.readFile(path.join(appDataDir, 'assets', `${hash}.pdf`))).toEqual(bytes);
  expect(loadNodeResourceReferences(nodeId)).toEqual([]);
  closeDatabaseConnection();
  expect(await prepareReadwiseApiFrozenResources({ ...input, dependencies: { fetchImpl } })).toEqual(prepared);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect((await commitReadwiseApiDocument({ ...input, preparedResources: prepared })).status).toBe('imported');
  expect(loadNodeResourceReferences(nodeId)).toEqual([{ storage_key: `${hash}.pdf`, role: 'reference', original_name: 'Book.pdf' }]);
  expect(loadNodeBodyResolution(openDatabaseConnection().driver, nodeId)).toMatchObject({ content: document.body });
});

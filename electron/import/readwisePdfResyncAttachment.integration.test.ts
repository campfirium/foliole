// @vitest-environment node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { resolveAttachmentFile, resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { loadReadwiseRemoteSource, saveReadwiseConnectionState } from '../database/readwiseRemoteIdentity.js';

import { disconnectReadwiseApi } from './readwiseApiConnection.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { attachReadwiseApiOriginalFile } from './readwiseApiOriginalFile.js';
import { saveOriginalFileState } from './readwiseApiOriginalFileCommit.js';
import { openReadwiseImportTestDatabase } from './readwiseImportSqlite.testSupport.js';
import { resyncReadwiseSource } from './readwiseSourceResyncAction.js';

let database: ReturnType<typeof openReadwiseImportTestDatabase>;
let root: string;
let nodeId: string;
let pauseAfterParsing: (() => Promise<void>) | undefined;

vi.mock('electron', () => ({}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => database,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/pdfIndexing.js', () => ({ enqueuePdfAttachmentIndexing: vi.fn(), markPdfAttachmentIndexPending: vi.fn() }));
vi.mock('../database/pdfPageTextWorkerClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database/pdfPageTextWorkerClient.js')>();
  return {
    ...actual,
    extractPdfMatchPagesOffMainThread: async (bytes: Uint8Array) => {
      const pages = await actual.extractPdfMatchPagesOffMainThread(bytes);
      await pauseAfterParsing?.();
      return pages;
    }
  };
});
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'), app_config_dir: path.join(root, 'config'),
  app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('../security/secureStorageBackend.js', () => ({ ensureSecureStorageBackend: vi.fn() }));
vi.mock('./readwiseApiSecret.js', () => ({
  deleteReadwiseApiSecret: vi.fn(), hasReadwiseApiSecret: () => true, readReadwiseApiSecret: () => 'test-token'
}));

const now = '2026-01-01T00:00:00.000Z';
const documentId = 'document';
const connectionRef = 'connection';
const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
const hash = createHash('sha256').update(bytes).digest('hex');

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'readwise-pdf-resync-'));
  database = openReadwiseImportTestDatabase();
  pauseAfterParsing = undefined;
  publishAttachmentLibraryPathSnapshot({ assetsDir: path.join(root, 'assets'), libraryScope: root });
  saveReadwiseConnectionState({ secretRef: 'test-secret', state: 'connected', verifiedAt: now },
    { connectionRef, createdAt: now, updatedAt: now, version: 1 }, now);
  materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(), connectionRef, destination: 'inbox',
    document: {
      annotations: [{ content: 'alpha keyword', contentHash: 'h1', kind: 'highlight', locatorText: null,
        parentRemoteId: documentId, remoteId: 'highlight', updatedAt: null }],
      body: 'Reader text', category: 'pdf', coverImageUrl: null, degradedReason: null, id: documentId,
      metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null, title: 'PDF' },
      title: 'PDF', unmatchedAnnotationCount: 0, updatedAt: null
    }
  });
  nodeId = loadReadwiseApiImportSource(connectionRef, documentId)!.nodeId!;
  const original = { attachmentId: hash, contentHash: hash, mimeType: 'application/pdf',
    reason: null, sizeBytes: bytes.length, status: 'localized' } as const;
  attachReadwiseApiOriginalFile(nodeId, original, 'PDF');
  saveOriginalFileState(connectionRef, documentId, original);
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  database?.sqlite.close();
  if (root) await rm(root, { recursive: true, force: true });
});

function readTopic() {
  return database.driver.queryOne('SELECT content, resource_references FROM nodes WHERE id = ?', [nodeId]);
}

function readHighlight() {
  const id = stableReadwiseAnnotationNodeId(connectionRef, 'highlight');
  return database.driver.queryOne<{ anchor_link: string | null; sync_dirty: number }>(
    'SELECT anchor_link, sync_dirty FROM nodes WHERE id = ?', [id]);
}

function remoteFetch(rawSourceUrl: string | null) {
  return vi.fn<typeof fetch>(async (input) => new URL(String(input)).hostname === 'readwise.io'
    ? Response.json({ results: [{ category: 'pdf', id: documentId, raw_source_url: rawSourceUrl }] })
    : new Response(bytes, { headers: { 'content-type': 'application/pdf' } }));
}

it('restores a missing localized original before reporting that the PDF resync succeeded', async () => {
  const fetchImpl = remoteFetch('https://bucket.s3.amazonaws.com/original.pdf');
  const before = readTopic();
  await expect(resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 })).resolves.toMatchObject({ status: 'completed' });
  expect(fetchImpl.mock.calls).toHaveLength(2);
  await expect(resolveAttachmentFile(`${hash}.pdf`)).resolves.toMatchObject({ status: 'ready' });
  expect(JSON.parse(readHighlight()?.anchor_link ?? '{}')).toMatchObject({ locator: { page: 1 } });
  expect(readTopic()).toEqual(before);
});

it('reports failure and makes no Topic writes if a missing localized original is unavailable from Readwise', async () => {
  const before = { topic: readTopic(), highlight: readHighlight(), source: loadReadwiseApiImportSource(connectionRef, documentId) };
  await expect(resyncReadwiseSource(nodeId, { fetchImpl: remoteFetch(null), minIntervalMs: 0 })).resolves.toMatchObject({
    error_code: 'original_file_not_distributed', status: 'failed'
  });
  expect(readTopic()).toEqual(before.topic);
  expect(readHighlight()).toEqual(before.highlight);
  expect(loadReadwiseApiImportSource(connectionRef, documentId)).toEqual(before.source);
});

it('fails when a repaired path still cannot be opened as a managed original', async () => {
  const storagePath = resolveAttachmentStoragePath(hash, undefined, 'application/pdf');
  const externalPath = path.join(root, 'outside.pdf');
  await writeFile(externalPath, bytes);
  await mkdir(path.dirname(storagePath), { recursive: true });
  await symlink(externalPath, storagePath);
  const fetchImpl = remoteFetch('https://bucket.s3.amazonaws.com/original.pdf');
  const before = readHighlight();
  await expect(resyncReadwiseSource(nodeId, { fetchImpl, minIntervalMs: 0 })).resolves.toMatchObject({
    status: 'failed'
  });
  expect(fetchImpl.mock.calls).toHaveLength(2);
  expect(readHighlight()).toEqual(before);
});

it.each(['connection disconnected', 'attachment link changed', 'Topic trashed'])(
  'discards a parsed PDF highlight when the %s before placement', async change => {
    const storagePath = resolveAttachmentStoragePath(hash, undefined, 'application/pdf');
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, bytes);
    const before = readHighlight();
    const parsed = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    pauseAfterParsing = () => { parsed.resolve(); return resume.promise; };
    const result = resyncReadwiseSource(nodeId, { fetchImpl: remoteFetch(null), minIntervalMs: 0 });
    try {
      await Promise.race([parsed.promise, result.then(value => { throw new Error(JSON.stringify(value)); })]);
      if (change === 'connection disconnected') {
        expect(disconnectReadwiseApi().status).toBe('disconnected');
        expect(loadReadwiseRemoteSource()?.connectionRef).toBe(connectionRef);
      } else if (change === 'attachment link changed') {
        database.driver.execute("UPDATE nodes SET resource_references = '[]' WHERE id = ?", [nodeId]);
      } else {
        database.driver.execute('UPDATE nodes SET deleted_at = ? WHERE id = ?', [now, nodeId]);
      }
    } finally {
      resume.resolve();
    }
    await expect(result).resolves.toMatchObject({ status: 'failed' });
    expect(readHighlight()).toEqual(before);
  });

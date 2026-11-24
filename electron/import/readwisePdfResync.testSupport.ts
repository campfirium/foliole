import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, vi } from 'vitest';

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { stableReadwiseAnnotationNodeId } from '../../lib/core/readwise/readwiseApiImport.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { saveReadwiseConnectionState } from '../database/readwiseRemoteIdentity.js';

import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';
import { attachReadwiseApiOriginalFile } from './readwiseApiOriginalFile.js';
import { saveOriginalFileState } from './readwiseApiOriginalFileCommit.js';
import { openReadwiseImportTestDatabase } from './readwiseImportSqlite.testSupport.js';

export let database: ReturnType<typeof openReadwiseImportTestDatabase>;
export let root: string;
export let nodeId: string;
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

export const now = '2026-01-01T00:00:00.000Z';
export const documentId = 'document';
export const connectionRef = 'connection';
export const bytes = readFileSync('tests/desktop/fixtures/pdf-user-journey.pdf');
export const hash = createHash('sha256').update(bytes).digest('hex');

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
      annotations: [{ content: 'alpha keyword', contentHash: createHash('sha256').update('alpha keyword').digest('hex'), kind: 'highlight', locatorText: null,
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

export function readTopic() {
  return database.driver.queryOne('SELECT content, resource_references FROM nodes WHERE id = ?', [nodeId]);
}

export function readHighlight(remoteId = 'highlight') {
  const id = stableReadwiseAnnotationNodeId(connectionRef, remoteId);
  return database.driver.queryOne<{ anchor_link: string | null; content: string; sync_dirty: number }>(
    'SELECT anchor_link, content, sync_dirty FROM nodes WHERE id = ?', [id]);
}

export function remoteFetch(rawSourceUrl: string | null) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v2/export/') return exportPage(null);
    return url.hostname === 'readwise.io'
      ? Response.json({ results: [{ category: 'pdf', id: documentId, raw_source_url: rawSourceUrl }] })
      : new Response(bytes, { headers: { 'content-type': 'application/pdf' } });
  });
}

export function exportPage(nextPageCursor: string | null, ...results: unknown[]) {
  return Response.json({ nextPageCursor, results });
}

export function exportBook(id: string, ...highlights: Array<{ external_id: string; note?: string; text: string }>) {
  return { external_id: id, highlights, source: 'reader', title: 'PDF' };
}

export async function writeLocalPdf() {
  const storagePath = resolveAttachmentStoragePath(hash, undefined, 'application/pdf');
  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, bytes);
}

export function pauseAfterPdfParsing(callback: () => Promise<void>) {
  pauseAfterParsing = callback;
}

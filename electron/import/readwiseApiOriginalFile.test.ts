// @vitest-environment node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

const fetchRawSource = vi.fn();
vi.mock('./readwiseApiImportFetch.js', () => ({
  fetchReadwiseRawSourceDocument: (...args: unknown[]) => fetchRawSource(...args)
}));
vi.mock('../database/pdfIndexing.js', () => ({
  enqueuePdfAttachmentIndexing: vi.fn(),
  markPdfAttachmentIndexPending: vi.fn()
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import {
  clearAttachmentLibraryPathSnapshot,
  publishAttachmentLibraryPathSnapshot
} from '../attachments/attachmentLibraryPathSnapshot.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import {
  persistReadwiseApiOriginalFile,
  prepareReadwiseApiOriginalFile
} from './readwiseApiOriginalFile.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-original-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  publishAttachmentLibraryPathSnapshot({
    assetsDir: path.join(mockedAppDataDir, 'assets'),
    libraryScope: 'test-library'
  });
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', NULL, 'document', 'PDF', 'Body', ?, ?)`,
    ['2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z']
  );
  fetchRawSource.mockReset();
});

afterEach(async () => {
  clearAttachmentLibraryPathSnapshot();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('refreshes an S3 URL without forwarding the token and persists one verified PDF attachment', async () => {
  const bytes = Buffer.from('%PDF-1.7\nverified original\n%%EOF');
  fetchRawSource.mockResolvedValue({
    category: 'pdf', id: 'document-1', rawSourceUrl: 'https://bucket.s3.amazonaws.com/signed.pdf?secret=gone'
  });
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    return new Response(bytes, {
      headers: { 'content-length': String(bytes.byteLength), 'content-type': 'application/pdf' }, status: 200
    });
  }) as typeof fetch;

  const prepared = await prepareReadwiseApiOriginalFile({
    category: 'pdf', dependencies: { fetchImpl }, documentId: 'document-1', hasHtmlBody: true
  });
  expect(prepared.state).toMatchObject({
    attachmentId: createHash('sha256').update(bytes).digest('hex'), status: 'localized'
  });
  if (!prepared.bytes || prepared.state.status !== 'localized') throw new Error('expected localized PDF');
  await persistReadwiseApiOriginalFile({
    bytes: prepared.bytes, category: 'pdf', nodeId: 'node-1', state: prepared.state, title: 'Remote PDF'
  });
  await persistReadwiseApiOriginalFile({
    bytes: prepared.bytes, category: 'pdf', nodeId: 'node-1', state: prepared.state, title: 'Remote PDF'
  });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) count FROM attachments')).toEqual({ count: 1 });
  expect(driver.queryOne<{ count: number }>('SELECT COUNT(*) count FROM node_attachments')).toEqual({ count: 1 });
  expect(driver.queryOne<{ availability: string; content_hash: string }>(
    'SELECT availability, content_hash FROM attachment_blobs'
  )).toEqual({ availability: 'local', content_hash: prepared.state.contentHash });
});

it('keeps HTML with explicit reasons for oversized and invalid PDF originals', async () => {
  fetchRawSource.mockResolvedValue({
    category: 'pdf', id: 'document-1', rawSourceUrl: 'https://bucket.s3.amazonaws.com/signed.pdf'
  });
  const oversizedFetch = vi.fn(async () => new Response(Buffer.from('%PDF-'), {
    headers: { 'content-length': String(101 * 1024 * 1024), 'content-type': 'application/pdf' }, status: 200
  })) as typeof fetch;
  await expect(prepareReadwiseApiOriginalFile({
    category: 'pdf', dependencies: { fetchImpl: oversizedFetch }, documentId: 'document-1', hasHtmlBody: false
  })).resolves.toMatchObject({ state: { reason: 'original_file_too_large', status: 'unavailable' } });

  const invalidFetch = vi.fn(async () => new Response(Buffer.from('<html>not pdf</html>'), {
    headers: { 'content-type': 'application/pdf' }, status: 200
  })) as typeof fetch;
  await expect(prepareReadwiseApiOriginalFile({
    category: 'pdf', dependencies: { fetchImpl: invalidFetch }, documentId: 'document-1', hasHtmlBody: true
  })).resolves.toMatchObject({ state: { reason: 'original_file_signature_mismatch', status: 'html_only' } });
});

it('rejects non-S3 transport URLs before downloading', async () => {
  fetchRawSource.mockResolvedValue({
    category: 'pdf', id: 'document-1', rawSourceUrl: 'https://example.com/signed.pdf'
  });
  const fetchImpl = vi.fn() as unknown as typeof fetch;
  await expect(prepareReadwiseApiOriginalFile({
    category: 'pdf', dependencies: { fetchImpl }, documentId: 'document-1', hasHtmlBody: true
  })).resolves.toMatchObject({ state: { reason: 'original_file_url_rejected', status: 'html_only' } });
  expect(fetchImpl).not.toHaveBeenCalled();
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, vi } from 'vitest';

import { deferred } from '../../src/test/deferred.js';
import { saveReadwiseDeviceConnection } from '../database/readwiseDeviceConnection.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { SqliteConnectionCoordinator } from '../database/sqliteConnectionCoordinator.js';
import { closeLibraries, createPeer, root, startLibraries } from '../database/syncLibrary.testSupport.js';

import { writeReadwiseApiSecret } from './readwiseApiSecret.js';
import { headingCoverEpubBytes } from './readwiseOriginalEpubCommitTestFixtures.js';

const showSaveDialog = vi.hoisted(() => vi.fn());
export { showSaveDialog };
export let library: ReturnType<typeof createPeer>;
export let destination: string;
export const coordinator = new SqliteConnectionCoordinator();
vi.mock('electron', () => ({
  app: { getPath: () => path.join(root, 'user-data') },
  dialog: { showSaveDialog },
  safeStorage: {
    decryptString: (data: Buffer) => data.toString(),
    encryptString: (value: string) => Buffer.from(value),
    getSelectedStorageBackend: () => 'test',
    isEncryptionAvailable: () => true
  }
}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => {
    coordinator.assertAccess();
    return { driver: library.driver, sqlite: library.db };
  },
  runWithDatabaseConnectionOwner: (run: () => unknown) => coordinator.runExclusive(run)
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_config_dir: path.join(root, 'config') })
}));

const now = '2026-11-24T00:00:00.000Z';
const secretRef = 'readwise-api-00000000-0000-0000-0000-000000000001.bin';
const originalUrl = 'https://bucket.s3.amazonaws.com/book.epub';

export function connectFixture() {
  writeReadwiseApiSecret(secretRef, 'test-token');
  saveReadwiseDeviceConnection({ secretRef, state: 'connected', verifiedAt: now });
}

beforeEach(async () => {
  await startLibraries();
  library = createPeer('desktop');
  destination = path.join(root, 'exports', 'Book.epub');
  await fs.mkdir(path.dirname(destination));
  showSaveDialog.mockResolvedValue({ canceled: false, filePath: destination });
  vi.spyOn(os, 'tmpdir').mockReturnValue(root);

  const { connectionRef } = ensureReadwiseRemoteSource(false, now);
  connectFixture();
  library.driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('book', 'topic', 'Book', 'Reader body', ?, ?)`, [now, now]);
  library.driver.execute(`INSERT INTO import_sources
    (source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at, last_imported_at,
     last_content_fingerprint, latest_node_id, remote_provider, remote_connection_ref, remote_document_id, remote_import_state_json)
    VALUES ('fingerprint', 'desktop_text_file', 'epub', 'Book', 'book', ?, ?, 'hash', 'book', 'readwise', ?, 'book', ?)`,
  [now, now, connectionRef, JSON.stringify({ metadata: { category: 'epub' }, bodyAuthority: 'reader_html' })]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await closeLibraries();
});

export function mockDownload(original: (signal?: AbortSignal | null) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: URL | string, init?: RequestInit) => {
    if (String(input) === originalUrl) return original(init?.signal);
    expect(String(input)).toBe('https://readwise.io/api/v3/list/?id=book&withRawSourceUrl=true');
    return Response.json({ results: [{ category: 'epub', id: 'book', raw_source_url: originalUrl, title: 'Book' }] });
  }));
}

export function pauseDownload() {
  const bytes = headingCoverEpubBytes();
  const bodyRead = deferred<void>();
  let stop: (() => void) | undefined;
  let signal: AbortSignal | null | undefined;
  mockDownload((downloadSignal) => {
    signal = downloadSignal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 32));
        signal?.addEventListener('abort', () => controller.error(signal?.reason), { once: true });
        stop = () => {
          if (!signal?.aborted) controller.error(new Error('test download released'));
        };
      },
      pull() { bodyRead.resolve(); }
    });
    return new Response(body, { headers: { 'content-type': 'application/epub+zip' } });
  });
  return { bodyRead: bodyRead.promise, stop: () => stop?.() };
}

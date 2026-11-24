// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { saveReadwiseDeviceConnection } from '../database/readwiseDeviceConnection.js';
import { ensureReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { closeLibraries, createPeer, root, startLibraries } from '../database/syncLibrary.testSupport.js';

import { disconnectReadwiseApi, loadReadwiseApiConnection } from './readwiseApiConnection.js';
import { writeReadwiseApiSecret } from './readwiseApiSecret.js';
import { loadReadwiseOriginalEpubActionState, useReadwiseOriginalEpub } from './readwiseOriginalEpubAction.js';
import { headingCoverEpubBytes } from './readwiseOriginalEpubCommitTestFixtures.js';
import { exportReadwiseOriginalEpub } from './readwiseOriginalEpubExport.js';

const showSaveDialog = vi.hoisted(() => vi.fn());
let library: ReturnType<typeof createPeer>;
let destination: string;
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
  openDatabaseConnection: () => ({ driver: library.driver, sqlite: library.db }),
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_config_dir: path.join(root, 'config') })
}));

const now = '2026-11-24T00:00:00.000Z';
const secretRef = 'readwise-api-00000000-0000-0000-0000-000000000001.bin';
const originalUrl = 'https://bucket.s3.amazonaws.com/book.epub';

function connectFixture() {
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

function mockDownload(original: (signal?: AbortSignal | null) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: URL | string, init?: RequestInit) => {
    if (String(input) === originalUrl) return original(init?.signal);
    expect(String(input)).toBe('https://readwise.io/api/v3/list/?id=book&withRawSourceUrl=true');
    return Response.json({ results: [{ category: 'epub', id: 'book', raw_source_url: originalUrl, title: 'Book' }] });
  }));
}

function pauseDownload() {
  const bytes = headingCoverEpubBytes();
  const bodyRead = Promise.withResolvers<void>();
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

it.each([false, true])('cancels a running export on disconnect (existing destination: %s)', async (existing) => {
  if (existing) await fs.writeFile(destination, 'existing book');
  const download = pauseDownload();
  const operation = exportReadwiseOriginalEpub('book', null);
  await download.bodyRead;
  expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
  // Reconnecting before the old request settles must not let it continue.
  connectFixture();
  try {
    await vi.waitFor(() => expect(operation).resolves.toMatchObject({ path: null, status: 'cancelled' }));
  } finally {
    download.stop();
    await operation;
  }
  expect(await fs.readdir(path.dirname(destination))).toEqual(existing ? ['Book.epub'] : []);
  if (existing) expect(await fs.readFile(destination, 'utf8')).toBe('existing book');

  const bytes = headingCoverEpubBytes();
  mockDownload(() => new Response(new Uint8Array(bytes)));
  await expect(exportReadwiseOriginalEpub('book', null)).resolves.toMatchObject({ path: destination, status: 'saved' });
  expect(await fs.readFile(destination)).toEqual(bytes);
});

it('removes partial export writes when Readwise is disconnected during the save', async () => {
  const bytes = headingCoverEpubBytes();
  mockDownload(() => new Response(new Uint8Array(bytes)));
  const partialWrite = Promise.withResolvers<string>();
  const release = Promise.withResolvers<void>();
  const writeFile = fs.writeFile.bind(fs);
  vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
    await writeFile(file, (data as Uint8Array).subarray(0, 32), options);
    partialWrite.resolve(String(file));
    await release.promise;
    await writeFile(file, data, { ...options as object, flag: 'w' });
  });

  const operation = exportReadwiseOriginalEpub('book', null);
  const partial = await partialWrite.promise;
  try {
    expect((await fs.stat(partial)).size).toBe(32);
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
  } finally {
    release.resolve();
  }
  await expect(operation).resolves.toMatchObject({ path: null, status: 'cancelled' });
  expect(await fs.readdir(path.dirname(destination))).toEqual([]);
});

it('cancels a rebuild after EPUB bytes reach disk and preserves the stored Reader book', async () => {
  const previousSources = library.driver.queryAll('SELECT * FROM import_sources');
  const previousNodes = library.driver.queryAll('SELECT * FROM nodes');
  const download = pauseDownload();
  const operation = useReadwiseOriginalEpub('book');
  try {
    await download.bodyRead;
    await vi.waitFor(async () => {
      const entry = (await fs.readdir(root)).find((name) => name.startsWith('foliole-readwise-epub-'));
      expect(entry).toBeDefined();
      expect((await fs.stat(path.join(root, entry!, 'original.epub'))).size).toBe(32);
    });
    expect(loadReadwiseOriginalEpubActionState('book')).toMatchObject({ status: 'running' });
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
    await vi.waitFor(() => expect(operation).resolves.toMatchObject({ status: 'cancelled' }));
  } finally {
    download.stop();
    await operation;
  }
  expect((await fs.readdir(root)).filter((name) => name.startsWith('foliole-readwise-epub-'))).toEqual([]);
  expect(library.driver.queryAll('SELECT * FROM import_sources')).toEqual(previousSources);
  expect(library.driver.queryAll('SELECT * FROM nodes')).toEqual(previousNodes);
  expect(loadReadwiseOriginalEpubActionState('book')).toMatchObject({ status: 'reconnect_required' });
});

it('keeps Readwise disconnected when an in-flight lookup returns an authorization error', async () => {
  const started = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<Response>();
  vi.stubGlobal('fetch', vi.fn(() => {
    started.resolve();
    return reply.promise;
  }));

  const operation = exportReadwiseOriginalEpub('book', null);
  await started.promise;
  try {
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
  } finally {
    reply.resolve(new Response(null, { status: 401 }));
  }
  await expect(operation).resolves.toMatchObject({ path: null, status: 'cancelled' });
  expect(loadReadwiseApiConnection()).toMatchObject({ has_credential: false, state: 'disconnected' });
  expect(await fs.readdir(path.dirname(destination))).toEqual([]);
});

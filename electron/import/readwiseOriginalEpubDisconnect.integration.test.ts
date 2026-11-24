// @vitest-environment node
import './readwiseOriginalEpubDisconnect.testSupport.js';

import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';


import { deferred } from '../../src/test/deferred.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { setAttachmentPublishedListener } from '../attachments/attachmentPublishedEvents.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { persistNodeResourceReference } from '../database/nodeResources.js';
import { root } from '../database/syncLibrary.testSupport.js';

import { disconnectReadwiseApi, loadReadwiseApiConnection } from './readwiseApiConnection.js';
import { loadReadwiseOriginalEpubActionState, useReadwiseOriginalEpub } from './readwiseOriginalEpubAction.js';
import { headingCoverEpubBytes } from './readwiseOriginalEpubCommitTestFixtures.js';
import {
  connectFixture, coordinator, destination, library, mockDownload, pauseDownload, showSaveDialog
} from './readwiseOriginalEpubDisconnect.testSupport.js';
import { exportReadwiseOriginalEpub } from './readwiseOriginalEpubExport.js';

// Supply the parser worker's result while exercising production image staging and rollback.
vi.mock('../ipc/epubImportBook.js', () => ({
  readRawEpubBook: async () => ({
    nodes: [{ key: 'chapter', title: 'Chapter', content: 'Chapter body', embeddedImages: [] }],
    rootContent: '![Cover](cover.png)',
    rootEmbeddedImages: [{ destination: 'cover.png', originalName: 'cover.png',
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]
  })
}));

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
  const partialWrite = deferred<string>();
  const release = deferred<void>();
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
    await expect(loadReadwiseOriginalEpubActionState('book')).resolves.toMatchObject({ status: 'running' });
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
    await vi.waitFor(() => expect(operation).resolves.toMatchObject({ status: 'cancelled' }));
  } finally {
    download.stop();
    await operation;
  }
  expect((await fs.readdir(root)).filter((name) => name.startsWith('foliole-readwise-epub-'))).toEqual([]);
  expect(library.driver.queryAll('SELECT * FROM import_sources')).toEqual(previousSources);
  expect(library.driver.queryAll('SELECT * FROM nodes')).toEqual(previousNodes);
  await expect(loadReadwiseOriginalEpubActionState('book')).resolves.toMatchObject({ status: 'reconnect_required' });
});

it('keeps Readwise disconnected when an in-flight lookup returns an authorization error', async () => {
  const started = deferred<void>();
  const reply = deferred<Response>();
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


it('rechecks the export after a busy database releases its connection while closing the save dialog', async () => {
  const bytes = headingCoverEpubBytes();
  const dialogOpened = deferred<void>();
  const selection = deferred<{ canceled: boolean; filePath: string }>();
  const release = deferred<void>();
  showSaveDialog.mockImplementationOnce(() => {
    dialogOpened.resolve();
    return selection.promise;
  });
  mockDownload(() => new Response(new Uint8Array(bytes)));
  const operation = exportReadwiseOriginalEpub('book', null);
  await dialogOpened.promise;
  const owner = coordinator.runExclusive(() => release.promise);
  try {
    selection.resolve({ canceled: false, filePath: destination });
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    release.resolve();
    await owner;
  }
  await expect(operation).resolves.toMatchObject({ path: destination, status: 'saved' });
  expect(await fs.readFile(destination)).toEqual(bytes);
});

it('keeps the existing destination if disconnect wins the final replacement race', async () => {
  const bytes = headingCoverEpubBytes();
  const previous = Buffer.from('existing book');
  await fs.writeFile(destination, previous);
  mockDownload(() => new Response(new Uint8Array(bytes)));
  let atDisconnect: Buffer | undefined;
  const disconnectAndRead = () => {
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
    atDisconnect = readFileSync(destination);
  };
  const rename = fs.rename.bind(fs);
  vi.spyOn(fs, 'rename').mockImplementationOnce(async (from, to) => {
    disconnectAndRead();
    await rename(from, to);
  });

  const result = await exportReadwiseOriginalEpub('book', null);
  if (!atDisconnect) disconnectAndRead();
  expect((await fs.readFile(destination)).equals(atDisconnect!)).toBe(true);
  expect(result.status).toBe(atDisconnect!.equals(previous) ? 'cancelled' : 'saved');
  expect(await fs.readdir(path.dirname(destination))).toEqual(['Book.epub']);
});

it('waits for a busy database before starting a rebuild that can still be cancelled', async () => {
  const download = pauseDownload();
  const release = deferred<void>();
  const owner = coordinator.runExclusive(() => release.promise);
  const operation = useReadwiseOriginalEpub('book');
  release.resolve();
  await owner;
  try {
    await Promise.race([download.bodyRead, operation]);
    await expect(loadReadwiseOriginalEpubActionState('book')).resolves.toMatchObject({ status: 'running' });
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
    await expect(operation).resolves.toMatchObject({ status: 'cancelled' });
  } finally {
    download.stop();
    await operation;
  }
});


it('preserves a published cover that another topic adopts before the rebuild is cancelled', async () => {
  const assetsDir = path.join(root, 'assets');
  publishAttachmentLibraryPathSnapshot({ assetsDir, libraryScope: root });
  mockDownload(() => new Response(new Uint8Array(headingCoverEpubBytes())));
  library.driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('other', 'topic', 'Other', '', 'now', 'now')`);
  let coverKey = '';
  setAttachmentPublishedListener(storageKey => {
    coverKey = storageKey;
    persistNodeResourceReference('other', { storage_key: storageKey, role: 'image', original_name: 'cover.png' });
    expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
  });
  try {
    await expect(useReadwiseOriginalEpub('book')).resolves.toMatchObject({ status: 'cancelled' });
    expect(library.driver.queryOne("SELECT content FROM nodes WHERE id = 'book'")).toEqual({ content: 'Reader body' });
    expect(await resolveAttachmentFile(coverKey)).toMatchObject({ status: 'ready' });
    expect(await fs.readdir(assetsDir)).toEqual([coverKey]);
  } finally {
    setAttachmentPublishedListener(null);
    clearAttachmentLibraryPathSnapshot();
  }
});


it('keeps EPUB actions available when their menu state is requested during a database write', async () => {
  const release = deferred<void>();
  const owner = coordinator.runExclusive(() => release.promise);
  const request = Promise.resolve().then(() => loadReadwiseOriginalEpubActionState('book'));
  release.resolve();
  await owner;
  await expect(request).resolves.toEqual({ node_id: 'book', status: 'ready' });
});

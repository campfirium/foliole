// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  canRunExternalSources: true,
  userDataPath: `/tmp/foliole-readwise-token-sync-${Math.random().toString(16).slice(2)}`
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => electronMock.userDataPath) },
  safeStorage: {
    decryptString: vi.fn((payload: Buffer) => payload.toString('utf8')),
    encryptString: vi.fn((payload: string) => Buffer.from(payload, 'utf8')),
    isEncryptionAvailable: vi.fn(() => true)
  }
}));
vi.mock('../sync/primaryDeviceState.js', () => ({
  canDesktopRunExternalSources: vi.fn(() => electronMock.canRunExternalSources)
}));
vi.mock('./readwiseHttpsFetch.js', () => ({
  readwiseHttpsFetch: (...args: Parameters<typeof fetch>) => fetch(...args)
}));

let tempRoot = '';

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-readwise-token-sync-'));
  electronMock.userDataPath = path.join(tempRoot, 'user-data');
  electronMock.canRunExternalSources = true;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(tempRoot, { force: true, recursive: true });
});

it('syncs Reader library documents into Readwise sources', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({
      nextPageCursor: null,
      results: [{ id: 'reader-doc-1', location: 'new', source_url: 'https://example.com/a', title: 'Reader article' }]
    }))
    .mockResolvedValueOnce(Response.json({
      results: [{ highlights: [{ id: 'highlight-1', text: 'Quote' }], id: 'book-1', source_url: 'https://example.com/a', title: 'Reader article' }]
    }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }));

  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  const { syncReadwiseTokenLibrary } = await import('./readwiseTokenSync.js');
  const { initializeDatabaseConnection } = await import('../../lib/core/database/index.js');
  const { closeDatabaseConnection, openDatabaseConnection } = await import('../database/connection.js');
  initializeDatabaseConnection(openDatabaseConnection());

  await connectReadwiseToken('token-secret');
  await expect(syncReadwiseTokenLibrary()).resolves.toMatchObject({ source_count: 1, status: 'synced' });
  expect(openDatabaseConnection().driver.queryOne(
    `SELECT provider, provider_document_id, presentation_state, source_name
     FROM document_sources WHERE source_id = ?`,
    ['reader-doc-1']
  )).toEqual({
    presentation_state: 'external',
    provider: 'readwise_reader',
    provider_document_id: 'reader-doc-1',
    source_name: 'Reader article'
  });
  expect(openDatabaseConnection().driver.queryOne('SELECT source_id, readwise_book_id FROM readwise_sources')).toEqual({
    readwise_book_id: 'book-1',
    source_id: 'reader-doc-1'
  });
  expect(openDatabaseConnection().driver.queryOne('SELECT highlight_id FROM readwise_source_annotations')).toEqual({
    highlight_id: 'highlight-1'
  });
  closeDatabaseConnection();
});

it('finishes paged Reader sync before advancing the waterline', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({
      nextPageCursor: 'cursor-2',
      results: [{ id: 'reader-doc-1', location: 'new', source_url: 'https://example.com/a', title: 'One' }]
    }))
    .mockResolvedValueOnce(Response.json({ results: [] }))
    .mockResolvedValueOnce(Response.json({
      nextPageCursor: null,
      results: [{ id: 'reader-doc-2', location: 'later', source_url: 'https://example.com/b', title: 'Two' }]
    }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }));

  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  const { syncReadwiseTokenLibrary } = await import('./readwiseTokenSync.js');
  const { initializeDatabaseConnection } = await import('../../lib/core/database/index.js');
  const { closeDatabaseConnection, openDatabaseConnection } = await import('../database/connection.js');
  const { loadJsonSetting } = await import('../database/settingsStore.js');
  initializeDatabaseConnection(openDatabaseConnection());

  await connectReadwiseToken('token-secret');
  await expect(syncReadwiseTokenLibrary()).resolves.toMatchObject({ source_count: 2, status: 'synced' });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM readwise_sources')?.count).toBe(2);
  expect(loadJsonSetting('readwise_token_sync_state')).toMatchObject({
    pendingPageCursor: null,
    syncStartedAt: null
  });
  closeDatabaseConnection();
});

it('recovers legacy Readwise sources into the visible external library', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }))
    .mockResolvedValueOnce(Response.json({ nextPageCursor: null, results: [] }));

  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  const { syncReadwiseTokenLibrary } = await import('./readwiseTokenSync.js');
  const { initializeDatabaseConnection } = await import('../../lib/core/database/index.js');
  const { closeDatabaseConnection, openDatabaseConnection } = await import('../database/connection.js');
  const { saveJsonSetting } = await import('../database/settingsStore.js');
  initializeDatabaseConnection(openDatabaseConnection());

  await connectReadwiseToken('token-secret');
  openDatabaseConnection().driver.execute(
    `INSERT INTO readwise_sources (
      source_id, reader_document_id, readwise_book_id, title, author, category, location,
      tags_json, source_url, raw_source_url, raw_source_url_status, remote_updated_at, sync_cursor,
      sync_status, source_state, promotion_lock, internal_node_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['reader-doc-legacy', 'reader-doc-legacy', null, 'Legacy article', null, 'article', 'new',
      '[]', 'https://example.com/legacy', null, 'unknown', null, null, 'synced', 'external', 0, null,
      '2026-05-10T00:00:00.000Z', '2026-05-10T00:00:00.000Z']
  );
  saveJsonSetting('readwise_token_sync_state', {
    pendingLocationIndex: 0,
    pendingPageCursor: null,
    syncStartedAt: null,
    updatedAfter: '2026-05-10T00:00:00.000Z'
  }, '2026-05-10T00:00:00.000Z');

  await expect(syncReadwiseTokenLibrary()).resolves.toMatchObject({
    message: 'Readwise sync finished; recovered 1 library documents.',
    source_count: 1,
    status: 'synced'
  });
  expect(openDatabaseConnection().driver.queryOne(
    `SELECT provider, provider_document_id, presentation_state, source_name
     FROM document_sources WHERE source_id = ?`,
    ['reader-doc-legacy']
  )).toEqual({
    presentation_state: 'external',
    provider: 'readwise_reader',
    provider_document_id: 'reader-doc-legacy',
    source_name: 'Legacy article'
  });
  closeDatabaseConnection();
});

it('runs a full initial sync when the waterline exists before visible Readwise sources', async () => {
  const requestedUrls: string[] = [];
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockImplementation(async (input) => {
      requestedUrls.push(String(input));
      if (String(input).includes('/api/v2/export/')) return Response.json({ results: [] });
      return Response.json({
        nextPageCursor: null,
        results: requestedUrls.length === 1
          ? [{ id: 'reader-doc-1', location: 'new', source_url: 'https://example.com/a', title: 'Reader article' }]
          : []
      });
    });

  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  const { syncReadwiseTokenLibrary } = await import('./readwiseTokenSync.js');
  const { initializeDatabaseConnection } = await import('../../lib/core/database/index.js');
  const { closeDatabaseConnection, openDatabaseConnection } = await import('../database/connection.js');
  const { saveJsonSetting } = await import('../database/settingsStore.js');
  initializeDatabaseConnection(openDatabaseConnection());

  await connectReadwiseToken('token-secret');
  saveJsonSetting('readwise_token_sync_state', {
    pendingLocationIndex: 0,
    pendingPageCursor: null,
    syncStartedAt: null,
    updatedAfter: '2026-05-10T00:00:00.000Z'
  }, '2026-05-10T00:00:00.000Z');

  await expect(syncReadwiseTokenLibrary()).resolves.toMatchObject({ source_count: 1, status: 'synced' });
  expect(requestedUrls.find((url) => url.includes('/api/v3/list/'))).not.toContain('updatedAfter=');
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM document_sources WHERE provider = 'readwise_reader'"
  )?.count).toBe(1);
  closeDatabaseConnection();
});

it('keeps the page cursor and waterline when Readwise rate limits a follow-up page', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({
      nextPageCursor: 'cursor-2',
      results: [{ id: 'reader-doc-1', location: 'new', source_url: 'https://example.com/a', title: 'One' }]
    }))
    .mockResolvedValueOnce(Response.json({ results: [] }))
    .mockResolvedValueOnce(new Response(null, { headers: { 'retry-after': '60' }, status: 429 }));

  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  const { syncReadwiseTokenLibrary } = await import('./readwiseTokenSync.js');
  const { initializeDatabaseConnection } = await import('../../lib/core/database/index.js');
  const { closeDatabaseConnection, openDatabaseConnection } = await import('../database/connection.js');
  const { loadJsonSetting } = await import('../database/settingsStore.js');
  initializeDatabaseConnection(openDatabaseConnection());

  await connectReadwiseToken('token-secret');
  await expect(syncReadwiseTokenLibrary()).resolves.toMatchObject({
    has_more: true,
    retry_after_seconds: 60,
    status: 'rate_limited'
  });
  expect(loadJsonSetting('readwise_token_sync_state')).toMatchObject({
    pendingPageCursor: 'cursor-2',
    updatedAfter: null
  });
  closeDatabaseConnection();
});

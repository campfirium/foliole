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
    }));

  const { connectReadwiseToken } = await import('./readwiseTokenConnector.js');
  const { syncReadwiseTokenLibrary } = await import('./readwiseTokenSync.js');
  const { initializeDatabaseConnection } = await import('../../lib/core/database/index.js');
  const { closeDatabaseConnection, openDatabaseConnection } = await import('../database/connection.js');
  initializeDatabaseConnection(openDatabaseConnection());

  await connectReadwiseToken('token-secret');
  await expect(syncReadwiseTokenLibrary()).resolves.toMatchObject({ source_count: 1, status: 'synced' });
  expect(openDatabaseConnection().driver.queryOne('SELECT source_id, readwise_book_id FROM readwise_sources')).toEqual({
    readwise_book_id: 'book-1',
    source_id: 'reader-doc-1'
  });
  expect(openDatabaseConnection().driver.queryOne('SELECT highlight_id FROM readwise_source_annotations')).toEqual({
    highlight_id: 'highlight-1'
  });
  closeDatabaseConnection();
});

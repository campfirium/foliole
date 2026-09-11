// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
let mockedConnectionRef = 'connection';
let mockedEligible = true;
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => mockedEligible
}));
vi.mock('../database/readwiseRemoteIdentity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../database/readwiseRemoteIdentity.js')>()),
  loadReadwiseRemoteSource: () => ({
    connectionRef: mockedConnectionRef, createdAt: 'created', updatedAt: 'updated', version: 1
  })
}));
vi.mock('./readwiseApiConnectionState.js', () => ({
  loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'readwise-api-00000000-0000-4000-8000-000000000001.bin', state: 'connected' },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import { previewReadwiseApiImport, runReadwiseApiImport } from './readwiseApiImportRun.js';
import {
  apiSettings,
  exportBook,
  importedReadwiseApiCount,
  readerDocument,
  response
} from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  mockedConnectionRef = 'connection';
  mockedEligible = true;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-run-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('queries only annotation scopes when every no-highlight category is off', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([exportBook('book', 'highlight', 'books')]);
    if (url.searchParams.get('category') === 'highlight') {
      return response([{ category: 'highlight', id: 'highlight', parent_id: 'book' }]);
    }
    if (url.searchParams.get('category') === 'note') return response([]);
    if (url.searchParams.get('id') === 'book') return response([readerDocument('book', 'epub')]);
    throw new Error(`unexpected Reader request: ${url}`);
  });
  const fetchImpl = fetchMock as typeof fetch;

  const preview = await previewReadwiseApiImport(apiSettings('off'), { fetchImpl, minIntervalMs: 0 });
  expect(preview).toMatchObject({ total_count: 1, with_highlights_count: 1, without_highlights_count: 0 });
  expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get('category'))
    .filter(Boolean)).toEqual(['highlight', 'note']);

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  expect(result).toMatchObject({ committed_count: 1, remaining_count: 0, status: 'completed' });
  expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
    expect.stringContaining('id=book')
  ]));
});

it('uses V3 parent categories and obtains each highlighted parent body once', async () => {
  const parentRequestOrder: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([
        exportBook('article', 'article-highlight', 'articles'),
        exportBook('book', 'book-highlight', 'books')
      ]);
    }
    if (url.searchParams.get('category') === 'highlight') {
      return response([
        { category: 'highlight', id: 'article-highlight', parent_id: 'article' },
        { category: 'highlight', id: 'book-highlight', parent_id: 'book' }
      ]);
    }
    if (url.searchParams.get('category') === 'note') return response([]);
    const id = url.searchParams.get('id') ?? '';
    if (id && !id.endsWith('highlight')) {
      parentRequestOrder.push(`${id}:${url.searchParams.has('withHtmlContent') ? 'body' : 'metadata'}`);
    }
    return response([readerDocument(id, id === 'article' ? 'epub' : 'article')]);
  }) as typeof fetch;

  await runReadwiseApiImport({ dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off') });

  expect(parentRequestOrder).toEqual(['article:body', 'book:body']);
});

it('keeps bodyless PDF and EPUB documents writable for original-file resolution', async () => {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([]);
    const category = url.searchParams.get('category');
    if (category === 'pdf') return response([readerDocument('pdf-1', 'pdf', false)]);
    if (category === 'epub') return response([readerDocument('epub-1', 'epub', false)]);
    return response([]);
  }) as typeof fetch;

  const preview = await previewReadwiseApiImport(apiSettings('inbox'), { fetchImpl, minIntervalMs: 0 });

  expect(preview).toMatchObject({ failed_count: 0, total_count: 2, write_count: 2 });
  expect(preview.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ remote_document_id: 'pdf-1', status: 'new' }),
    expect.objectContaining({ remote_document_id: 'epub-1', status: 'new' })
  ]));
});

it('processes more than 50 parent candidates without an artificial pause', async () => {
  const books = Array.from({ length: 51 }, (_, index) => exportBook(`doc-${index}`, `h-${index}`, 'articles'));
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response(books);
    if (url.searchParams.get('category') === 'highlight') {
      return response(books.map((_, index) => ({
        category: 'highlight', id: `h-${index}`, parent_id: `doc-${index}`
      })));
    }
    if (url.searchParams.get('category') === 'note') return response([]);
    const id = url.searchParams.get('id') ?? '';
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });

  expect(result).toMatchObject({ committed_count: 51, remaining_count: 0, status: 'completed' });
  expect(importedReadwiseApiCount()).toBe(51);
});

it('indexes enabled no-highlight categories with bodies and deduplicates highlighted parents', async () => {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) return response([exportBook('shared', 'highlight', 'articles')]);
    if (url.searchParams.get('category') === 'highlight') {
      return response([{ category: 'highlight', id: 'highlight', parent_id: 'shared' }]);
    }
    if (url.searchParams.has('category')) {
      return response(url.searchParams.get('category') === 'article'
        ? [readerDocument('shared', 'article', false), readerDocument('plain', 'article', false)]
        : []);
    }
    return response([readerDocument(url.searchParams.get('id') ?? '', 'article')]);
  }) as typeof fetch;

  const preview = await previewReadwiseApiImport(apiSettings('inbox'), { fetchImpl, minIntervalMs: 0 });
  expect(preview).toMatchObject({ total_count: 2, with_highlights_count: 1, without_highlights_count: 1 });
  expect(urls.filter((url) => url.searchParams.has('category'))).toHaveLength(9);
  expect(urls.filter((url) => ['article', 'email', 'epub', 'pdf', 'rss', 'tweet', 'video']
    .includes(url.searchParams.get('category') ?? '')).every(
    (url) => url.searchParams.get('withHtmlContent') === 'true'
  )).toBe(true);
});

it('does not request annotation documents individually after indexing them', async () => {
  const exactIds: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([exportBook('a', 'ha', 'books'), exportBook('b', 'hb', 'articles')]);
    }
    if (url.searchParams.get('category') === 'highlight') return response([
      { category: 'highlight', id: 'ha', parent_id: 'a' },
      { category: 'highlight', id: 'hb', parent_id: 'b' }
    ]);
    if (url.searchParams.get('category') === 'note') return response([]);
    const id = url.searchParams.get('id') ?? '';
    if (id) exactIds.push(id);
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  expect(result).toMatchObject({ committed_count: 2, status: 'completed' });
  expect(exactIds).toEqual(['a', 'b']);
});

it('invalidates old raw staging before restoring a cursor', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO readwise_api_import_runs
      (connection_ref, query_updated_after, round_started_at, reader_cursor, export_cursor, phase, updated_at)
     VALUES ('connection', NULL, 'old', 'legacy-cursor', NULL, 'reader', 'old')`
  );
  driver.execute(
    `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
     VALUES ('connection', 'reader', 'legacy', '{}')`
  );
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    expect(url.searchParams.has('pageCursor')).toBe(false);
    return response([]);
  }) as typeof fetch;

  await previewReadwiseApiImport(apiSettings('off'), { fetchImpl, minIntervalMs: 0 });

  expect(driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) count FROM readwise_api_import_stage WHERE record_kind = 'reader'`
  )).toEqual({ count: 0 });
  expect(driver.queryOne<{ phase: string }>(
    `SELECT phase FROM readwise_api_import_runs WHERE connection_ref = 'connection'`
  )?.phase).toBe('candidate-v3:ready');
  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).resolves.toMatchObject({ committed_count: 0, remaining_count: 0, status: 'completed' });
  expect(driver.queryOne(
    `SELECT phase FROM readwise_api_import_runs WHERE connection_ref = 'connection'`
  )).toBeUndefined();
});

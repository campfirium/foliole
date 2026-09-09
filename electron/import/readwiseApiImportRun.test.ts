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

it('does not scan Reader when content without highlights is off', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([exportBook('book', 'highlight', 'books')]);
    if (url.searchParams.get('id') === 'book') return response([readerDocument('book', 'epub')]);
    if (url.searchParams.get('id') === 'highlight') {
      return response([{ category: 'highlight', id: 'highlight', parent_id: 'book' }]);
    }
    throw new Error(`unexpected Reader request: ${url}`);
  });
  const fetchImpl = fetchMock as typeof fetch;

  const preview = await previewReadwiseApiImport(apiSettings('off'), { fetchImpl, minIntervalMs: 0 });
  expect(preview).toMatchObject({ total_count: 1, with_highlights_count: 1, without_highlights_count: 0 });
  expect(fetchMock.mock.calls.map(([input]) => String(input))).toHaveLength(1);

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  expect(result).toMatchObject({ committed_count: 1, remaining_count: 0, status: 'completed' });
  expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(expect.arrayContaining([
    expect.stringContaining('id=book'),
    expect.stringContaining('id=highlight')
  ]));
});

it('keeps v2 books ahead of other candidates without treating Reader epub as Books', async () => {
  const exactOrder: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([
        exportBook('article', 'article-highlight', 'articles'),
        exportBook('book', 'book-highlight', 'books')
      ]);
    }
    const id = url.searchParams.get('id') ?? '';
    exactOrder.push(id);
    if (id.endsWith('highlight')) {
      return response([{ category: 'highlight', id, parent_id: id.startsWith('book') ? 'book' : 'article' }]);
    }
    return response([readerDocument(id, id === 'article' ? 'epub' : 'article')]);
  }) as typeof fetch;

  await runReadwiseApiImport({ dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off') });

  expect(exactOrder.slice(0, 2)).toEqual(['book', 'book-highlight']);
  expect(exactOrder).toContain('article');
});

it('processes more than 50 parent candidates without an artificial pause', async () => {
  const books = Array.from({ length: 51 }, (_, index) => exportBook(`doc-${index}`, `h-${index}`, 'articles'));
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response(books);
    const id = url.searchParams.get('id') ?? '';
    if (id.startsWith('h-')) {
      return response([{ category: 'highlight', id, parent_id: `doc-${id.slice(2)}` }]);
    }
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });

  expect(result).toMatchObject({ committed_count: 51, remaining_count: 0, status: 'completed' });
  expect(importedReadwiseApiCount()).toBe(51);
});

it('indexes enabled no-highlight categories without downloading bodies, then deduplicates exact parents', async () => {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) return response([exportBook('shared', 'highlight', 'articles')]);
    if (url.searchParams.has('category')) {
      return response(url.searchParams.get('category') === 'article'
        ? [readerDocument('shared', 'article', false), readerDocument('plain', 'article', false)]
        : []);
    }
    if (url.searchParams.get('id') === 'highlight') {
      return response([{ category: 'highlight', id: 'highlight', parent_id: 'shared' }]);
    }
    return response([readerDocument(url.searchParams.get('id') ?? '', 'article')]);
  }) as typeof fetch;

  const preview = await previewReadwiseApiImport(apiSettings('inbox'), { fetchImpl, minIntervalMs: 0 });
  expect(preview).toMatchObject({ total_count: 2, with_highlights_count: 1, without_highlights_count: 1 });
  expect(urls.filter((url) => url.searchParams.has('category'))).toHaveLength(7);
  expect(urls.filter((url) => url.searchParams.has('category')).every(
    (url) => !url.searchParams.has('withHtmlContent')
  )).toBe(true);
});

it('commits the first complete document while the producer waits for the next body', async () => {
  let releaseSecond: (() => void) | undefined;
  let secondStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { secondStarted = resolve; });
  const blocked = new Promise<void>((resolve) => { releaseSecond = resolve; });
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([exportBook('a', 'ha', 'books'), exportBook('b', 'hb', 'articles')]);
    }
    const id = url.searchParams.get('id') ?? '';
    if (id === 'b') {
      secondStarted?.();
      await blocked;
    }
    if (id === 'ha' || id === 'hb') {
      return response([{ category: 'highlight', id, parent_id: id === 'ha' ? 'a' : 'b' }]);
    }
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  const running = runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  await started;
  await vi.waitFor(() => expect(importedReadwiseApiCount()).toBe(1));
  releaseSecond?.();
  await expect(running).resolves.toMatchObject({ committed_count: 2, status: 'completed' });
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
  )?.phase).toBe('candidate-v2:ready');
  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).resolves.toMatchObject({ committed_count: 0, remaining_count: 0, status: 'completed' });
  expect(driver.queryOne(
    `SELECT phase FROM readwise_api_import_runs WHERE connection_ref = 'connection'`
  )).toBeUndefined();
});

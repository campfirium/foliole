// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: () => true
}));
vi.mock('../database/readwiseRemoteIdentity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../database/readwiseRemoteIdentity.js')>()),
  loadReadwiseRemoteSource: () => ({
    connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1
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
import { loadReadwiseApiAnnotationLedger } from '../database/readwiseApiIndexStage.js';

import { shouldFetchReadwiseApiCandidateFacts } from './readwiseApiCandidateLifecycle.js';
import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import {
  apiSettings,
  exportBook,
  importedReadwiseApiCount,
  readerDocument,
  response
} from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

it('reuses local facts when only the writing phase failed', () => {
  expect(shouldFetchReadwiseApiCandidateFacts({
    destination: 'inbox', documentId: 'local-ready', exportCategory: null,
    failure: { attemptCount: 1, failedAt: 'now', reason: 'request_failed', stage: 'writing' },
    hasHighlights: false, highlightIds: [], readerCategory: 'epub', status: 'failed', title: 'Local'
  })).toBe(false);
  expect(shouldFetchReadwiseApiCandidateFacts({
    destination: 'inbox', documentId: 'remote-needed', exportCategory: null,
    failure: { attemptCount: 1, failedAt: 'now', reason: 'request_failed', stage: 'fetching' },
    hasHighlights: false, highlightIds: [], readerCategory: 'epub', status: 'failed', title: 'Remote'
  })).toBe(true);
});

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-retry-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('resumes a failed parent fetch without refetching completed scopes', async () => {
  let fail = true;
  const requestedParents: string[] = [];
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
    if ((id === 'a' || id === 'b') && url.searchParams.has('withHtmlContent')) {
      requestedParents.push(id);
    }
    if (id === 'a' && fail && url.searchParams.has('withHtmlContent')) {
      return new Response('{}', { status: 500 });
    }
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).rejects.toThrow('readwise_api_http_500');
  expect(importedReadwiseApiCount()).toBe(0);

  fail = false;
  requestedParents.length = 0;
  const second = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  expect(second).toMatchObject({ committed_count: 2, remaining_count: 0, status: 'completed' });
  expect(requestedParents).toEqual(['a', 'b']);
  expect(importedReadwiseApiCount()).toBe(2);
});

it('honors Retry-After without refetching an already completed candidate', async () => {
  let limited = true;
  const requestedParents: string[] = [];
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
    if ((id === 'a' || id === 'b') && url.searchParams.has('withHtmlContent')) {
      requestedParents.push(id);
    }
    if (id === 'b' && limited && url.searchParams.has('withHtmlContent')) {
      limited = false;
      return new Response('{}', { headers: { 'Retry-After': '1' }, status: 429 });
    }
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });

  expect(result).toMatchObject({ committed_count: 2, remaining_count: 0, status: 'completed' });
  expect(requestedParents).toEqual(['a', 'b', 'b']);
  expect(importedReadwiseApiCount()).toBe(2);
});

it('records one missing article parent without retrying it on an unchanged run', async () => {
  let firstRun = true;
  let parentAvailable = false;
  let parentRequests = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([exportBook('gone', 'hg', 'articles')]);
    if (url.searchParams.get('category') === 'highlight') {
      return response(firstRun ? [{ category: 'highlight', id: 'hg', parent_id: 'gone' }] : []);
    }
    if (url.searchParams.get('category') === 'note') return response([]);
    if (url.searchParams.get('id') === 'gone') {
      parentRequests += 1;
      return response(parentAvailable ? [readerDocument('gone', 'article')] : []);
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;

  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).resolves.toMatchObject({ committed_count: 0, status: 'completed' });
  expect(parentRequests).toBe(1);
  expect(loadReadwiseApiAnnotationLedger('connection')).toEqual([
    expect.objectContaining({
      documentId: 'gone', remoteId: 'hg', resolution: 'article-parent-unavailable'
    })
  ]);

  firstRun = false;
  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).resolves.toMatchObject({ committed_count: 0, status: 'completed' });
  expect(parentRequests).toBe(1);
  expect(importedReadwiseApiCount()).toBe(0);

  firstRun = true;
  parentAvailable = true;
  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).resolves.toMatchObject({ committed_count: 1, status: 'completed' });
  expect(parentRequests).toBe(2);
  expect(loadReadwiseApiAnnotationLedger('connection')).toEqual([
    expect.objectContaining({ documentId: 'gone', remoteId: 'hg', resolution: 'resolved' })
  ]);
});

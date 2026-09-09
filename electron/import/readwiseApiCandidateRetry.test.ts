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
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import {
  apiSettings,
  exportBook,
  importedReadwiseApiCount,
  readerDocument,
  response
} from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

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

it('continues after one document fails and retries only unfinished candidates', async () => {
  let fail = true;
  const requestedParents: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([exportBook('a', 'ha', 'books'), exportBook('b', 'hb', 'articles')]);
    }
    const id = url.searchParams.get('id') ?? '';
    if (id === 'a' || id === 'b') requestedParents.push(id);
    if (id === 'a' && fail) return new Response('{}', { status: 500 });
    if (id === 'ha' || id === 'hb') {
      return response([{ category: 'highlight', id, parent_id: id === 'ha' ? 'a' : 'b' }]);
    }
    return response([readerDocument(id, 'article')]);
  }) as typeof fetch;

  const first = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  expect(first).toMatchObject({ committed_count: 1, remaining_count: 1, status: 'failed' });
  expect(importedReadwiseApiCount()).toBe(1);
  expect(loadReadwiseApiCandidates('connection')).toEqual(expect.arrayContaining([
    expect.objectContaining({ documentId: 'a', failure: expect.objectContaining({ attemptCount: 1, stage: 'fetching' }), status: 'failed' }),
    expect.objectContaining({ documentId: 'b', status: 'completed' })
  ]));

  fail = false;
  requestedParents.length = 0;
  const second = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });
  expect(second).toMatchObject({ committed_count: 1, remaining_count: 0, status: 'completed' });
  expect(requestedParents).toEqual(['a']);
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
    const id = url.searchParams.get('id') ?? '';
    if (id === 'a' || id === 'b') requestedParents.push(id);
    if (id === 'b' && limited) {
      limited = false;
      return new Response('{}', { headers: { 'Retry-After': '1' }, status: 429 });
    }
    if (id === 'ha' || id === 'hb') {
      return response([{ category: 'highlight', id, parent_id: id === 'ha' ? 'a' : 'b' }]);
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

it('keeps a candidate failed after three exact parent lookups return empty', async () => {
  let parentRequests = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([exportBook('gone', 'hg', 'articles')]);
    if (url.searchParams.get('id') === 'gone') {
      parentRequests += 1;
      return response([]);
    }
    throw new Error(`unexpected request: ${url}`);
  }) as typeof fetch;

  const result = await runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  });

  expect(result).toMatchObject({
    committed_count: 0,
    failed_count: 1,
    remaining_count: 1,
    skipped_count: 0,
    status: 'failed'
  });
  expect(parentRequests).toBe(3);
  expect(importedReadwiseApiCount()).toBe(0);
});

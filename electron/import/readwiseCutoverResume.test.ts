// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
const state = vi.hoisted(() => ({ connectionReady: true }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canCurrentHostRunReadwise: (mode = 'relay') => mode === 'relay',
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: true })
}));
vi.mock('./readwiseApiConnectionState.js', async () => {
  const { createDefaultReadwiseReaderConfig } = await import('../../lib/core/import/readwiseReaderSettings.js');
  return {
    isStoredReadwiseApiConnectionReady: () => state.connectionReady,
    loadStoredReadwiseHostSettings: () => ({
      apiConnection: { secretRef: 'readwise-secret', state: 'connected' },
      readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
      readwiseSourceMode: 'folder'
    })
  };
});
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'secret' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadReadwiseApiCompletedThrough } from '../database/readwiseApiImportState.js';
import { ensureReadwiseRemoteSource, loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { fetchReadwiseApiImportRound, fetchReadwiseSourceCutoverSnapshot } from './readwiseApiImportFetch.js';
import { readCutoverDownloadProgress } from './readwiseCutoverDownload.js';
import { previewReadwiseSourceCutover, runReadwiseSourceCutover } from './readwiseSourceCutover.js';
import { invalidateIncompleteReadwiseSourceCutover } from './readwiseSourceCutoverReset.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-restored-library-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  state.connectionReady = true;
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('This Mac');
  openDatabaseConnection().driver.execute(
    "INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('readwise_source_mode','{\"mode\":\"relay\",\"version\":1}','old')"
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});


it('persists both first pages and resumes only unsaved pages after reopening the database', async () => {
  const source = ensureReadwiseRemoteSource();
  const calls: string[] = [];
  let fail = true;
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const key = `${url.pathname}:${url.searchParams.get('pageCursor') ?? 'first'}`;
    calls.push(key);
    if (key.endsWith(':reader-next') && fail) throw new Error('offline');
    const reader = url.pathname.includes('/v3/');
    return Response.json({ count: reader ? 2 : 1, nextPageCursor: reader && !url.searchParams.has('pageCursor') ? 'reader-next' : null,
      results: reader ? [{ category: 'article', id: url.searchParams.has('pageCursor') ? 'second' : 'first', title: 'Article' }]
        : [{ source: 'reader', external_id: 'first', highlights: [] }] });
  });
  const options = { allowFolderModeForCutover: true, fetchImpl, minIntervalMs: 0 };
  await expect(fetchReadwiseSourceCutoverSnapshot(source.connectionRef, options)).rejects.toThrow('network_failed');
  expect(calls.slice(0, 2)).toEqual(['/api/v3/list/:first', '/api/v2/export/:first']);
  expect(readCutoverDownloadProgress(source.connectionRef)).toEqual({ completed: 2, total: 3 });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>('SELECT COUNT(*) count FROM nodes')?.count).toBe(0);
  closeDatabaseConnection();
  initializeDatabaseConnection(openDatabaseConnection());
  fail = false;
  calls.length = 0;
  await fetchReadwiseSourceCutoverSnapshot(source.connectionRef, options);
  expect(calls).toEqual(['/api/v3/list/:reader-next']);
  expect(readCutoverDownloadProgress(source.connectionRef)).toEqual({ completed: 3, total: 3 });
});

it('keeps unknown or changing totals indeterminate instead of inventing percentages', async () => {
  const source = ensureReadwiseRemoteSource();
  const progress: Array<{ completed: number; total: number | null }> = [];
  await fetchReadwiseSourceCutoverSnapshot(source.connectionRef, {
    allowFolderModeForCutover: true, minIntervalMs: 0,
    onPage: () => progress.push(readCutoverDownloadProgress(source.connectionRef)),
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.includes('/v2/')) return Response.json({ count: 0, results: [], nextPageCursor: null });
      const last = url.searchParams.has('pageCursor');
      return Response.json({ count: last ? 3 : 2, nextPageCursor: last ? null : 'next',
        results: [{ category: 'article', id: last ? 'b' : 'a', title: 'Article' }] });
    }
  });
  expect(progress).toEqual([{ completed: 1, total: null }, { completed: 1, total: 2 }, { completed: 2, total: null }]);
});

it('resumes finalization with a frozen denominator and promotes the original download boundary', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`CREATE TRIGGER pause_completion BEFORE UPDATE OF value ON settings
    WHEN NEW.key='readwise_source_mode' BEGIN SELECT RAISE(ABORT, 'pause completion'); END`);
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/')) return Response.json({ count: 1, results: [{ source: 'reader', external_id: 'new-topic', highlights: [{ external_id: 'h', text: 'Body' }] }], nextPageCursor: null });
    return Response.json({ count: 3, results: [
      { category: 'article', id: 'new-topic', title: 'New article', html_content: '<p>Body</p>' },
      { category: 'highlight', id: 'h', parent_id: 'new-topic', title: 'Highlight' },
      { category: 'rss', id: 'skip', title: 'Excluded', html_content: '<p>Body</p>' }
    ], nextPageCursor: null });
  });
  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } })).resolves.toMatchObject({ status: 'failed' });
  const source = loadReadwiseRemoteSource()!;
  const started = driver.queryOne<{ round_started_at: string }>('SELECT round_started_at FROM readwise_api_import_runs')!.round_started_at;
  expect(loadReadwiseApiCompletedThrough(source.connectionRef)).toBeNull();
  const before = await previewReadwiseSourceCutover();
  expect(before).toMatchObject({ total_count: 1, completed_count: 1 });
  const nodesBefore = driver.queryAll('SELECT id, content, updated_at FROM nodes ORDER BY id');
  driver.execute('DROP TRIGGER pause_completion');
  fetchImpl.mockClear();
  await expect(runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } })).resolves.toMatchObject({ status: 'completed' });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(driver.queryAll('SELECT id, content, updated_at FROM nodes ORDER BY id')).toEqual(nodesBefore);
  expect(loadReadwiseApiCompletedThrough(source.connectionRef)).toBe(new Date(Date.parse(started) - 60_000).toISOString());
  expect((await previewReadwiseSourceCutover()).total_count).toBe(before.total_count);
  const urls: URL[] = [];
  await fetchReadwiseApiImportRound(source.connectionRef, {
    allowFolderModeForCutover: true, minIntervalMs: 0, fetchImpl: async (input) => {
      urls.push(new URL(String(input)));
      return Response.json({ count: 0, results: [], nextPageCursor: null });
    }
  });
  expect(urls).toHaveLength(2);
  expect(urls.every((url) => url.searchParams.get('updatedAfter') === loadReadwiseApiCompletedThrough(source.connectionRef))).toBe(true);
});

it('rejects a late page from an invalidated token batch without changing the replacement batch', async () => {
  const source = ensureReadwiseRemoteSource();
  const fetchImpl = vi.fn(async () => {
    invalidateIncompleteReadwiseSourceCutover({ connectionRef: source.connectionRef, sourceHost: 'This Mac' });
    return Response.json({ count: 1, nextPageCursor: null, results: [{ category: 'article', id: 'stale', title: 'Stale' }] });
  });
  expect((await runReadwiseSourceCutover({ dependencies: { fetchImpl, minIntervalMs: 0 } })).status).toBe('failed');
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM readwise_api_import_stage'
  )?.count).toBe(0);
  expect(loadReadwiseSourceCutover()).not.toHaveProperty('errorReason');
});

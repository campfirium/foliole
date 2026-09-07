// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
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
import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';

import {
  cancelReadwiseApiImport,
  previewReadwiseApiImport,
  runReadwiseApiImport
} from './readwiseApiImportRun.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-run-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('resumes a failed page cursor and commits no more than 50 parent documents per user action', async () => {
  let failSecondPage = true;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return new Response(JSON.stringify({ nextPageCursor: null, results: [] }), { status: 200 });
    }
    if (url.searchParams.get('pageCursor') === 'reader-2') {
      if (failSecondPage) {
        failSecondPage = false;
        return new Response('{}', { headers: { 'Retry-After': '1' }, status: 429 });
      }
      return response(documents(25, 26));
    }
    return response(documents(0, 25), 'reader-2');
  });
  const fetchImpl = fetchMock as typeof fetch;
  const settings = apiSettings();

  await expect(previewReadwiseApiImport(settings, { fetchImpl, minIntervalMs: 0 }))
    .rejects.toThrow('readwise_api_rate_limited:1');
  const preview = await previewReadwiseApiImport(settings, { fetchImpl, minIntervalMs: 0 });
  expect(preview).toMatchObject({ batch_count: 50, mode: 'api', total_count: 51, write_count: 51 });
  expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('pageCursor=reader-2'))).toHaveLength(2);

  const first = await runReadwiseApiImport({ dependencies: { fetchImpl, minIntervalMs: 0 }, settings });
  expect(first).toMatchObject({ committed_count: 50, remaining_count: 1, status: 'paused' });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM import_sources WHERE remote_provider = 'readwise'"
  )).toEqual({ count: 50 });

  const second = await runReadwiseApiImport({ dependencies: { fetchImpl, minIntervalMs: 0 }, settings });
  expect(second).toMatchObject({ committed_count: 1, remaining_count: 0, status: 'completed' });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) count FROM import_sources WHERE remote_provider = 'readwise'"
  )).toEqual({ count: 51 });
});

it('preserves the completed page when a fetch is cancelled and resumes from its cursor', async () => {
  let releaseSecondPage: (() => void) | null = null;
  const secondPageStarted = new Promise<void>((resolve) => { releaseSecondPage = resolve; });
  let cancelled = false;
  const interruptedFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.searchParams.get('pageCursor') !== 'reader-2') return response(documents(0, 1), 'reader-2');
    releaseSecondPage?.();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        cancelled = true;
        reject(new DOMException('cancelled', 'AbortError'));
      }, { once: true });
    });
  }) as typeof fetch;

  const pending = runReadwiseApiImport({
    dependencies: { fetchImpl: interruptedFetch, minIntervalMs: 0 }, settings: apiSettings()
  });
  await secondPageStarted;
  expect(cancelReadwiseApiImport()).toEqual({ status: 'cancelled' });
  await expect(pending).resolves.toMatchObject({ status: 'cancelled' });
  expect(cancelled).toBe(true);

  const resumedFetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([]);
    expect(url.searchParams.get('pageCursor')).toBe('reader-2');
    return response(documents(1, 1));
  }) as typeof fetch;
  const preview = await previewReadwiseApiImport(apiSettings(), { fetchImpl: resumedFetch, minIntervalMs: 0 });
  expect(preview.total_count).toBe(2);
});

it('hydrates a note-only incremental update through its highlight to the body document', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([{ external_id: 'document-1', highlights: [{ external_id: 'highlight-1' }], source: 'reader' }]);
    }
    if (url.searchParams.get('id') === 'highlight-1') {
      return response([{ category: 'highlight', html_content: '<p>Excerpt</p>', id: 'highlight-1', parent_id: 'document-1' }]);
    }
    if (url.searchParams.get('id') === 'document-1') {
      return response([{ category: 'article', html_content: '<p>Body with Excerpt</p>', id: 'document-1', title: 'Document' }]);
    }
    return response([{ category: 'note', html_content: '<p>My note</p>', id: 'note-1', parent_id: 'highlight-1' }]);
  }) as typeof fetch;

  const preview = await previewReadwiseApiImport(apiSettings(), { fetchImpl: fetchMock, minIntervalMs: 0 });
  expect(preview).toMatchObject({ total_count: 1, with_highlights_count: 1 });
  expect(preview.entries[0]).toMatchObject({ detected_highlight_count: 2, remote_document_id: 'document-1' });
});

function response(results: unknown[], nextPageCursor: string | null = null) {
  return new Response(JSON.stringify({ nextPageCursor, results }), { status: 200 });
}

function documents(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    category: 'article', html_content: `<p>Body ${start + index}</p>`,
    id: `document-${String(start + index).padStart(3, '0')}`, title: `Title ${start + index}`,
    updated_at: '2026-09-07T00:00:00.000Z'
  }));
}

function apiSettings() {
  const settings = createDefaultImportManagerSettings();
  return {
    ...settings,
    readwiseReaderConfig: {
      ...settings.readwiseReaderConfig,
      withoutHighlightsDestination: 'inbox' as const
    },
    readwiseSourceMode: 'api' as const
  };
}

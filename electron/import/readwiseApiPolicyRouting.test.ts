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
    apiConnection: {
      secretRef: 'readwise-api-00000000-0000-4000-8000-000000000001.bin',
      state: 'connected'
    },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { writeLegacyReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { previewReadwiseApiImport, runReadwiseApiImport } from './readwiseApiImportRun.js';
import { apiSettings, exportBook, readerDocument, response } from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-policy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('does not download a body or highlights when metadata resolves to an Off cell', async () => {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) {
      return response([exportBook('off-article', 'off-highlight', 'books')]);
    }
    if (url.searchParams.get('id') === 'off-article') {
      return response([readerDocument('off-article', 'article', false)]);
    }
    throw new Error(`unexpected Off request: ${url}`);
  }) as typeof fetch;
  const base = apiSettings('off');
  const settings = {
    ...base,
    readwiseAutoImportPolicy: {
      ...base.readwiseAutoImportPolicy,
      articleWithHighlights: 'off' as const
    }
  };

  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings
  })).resolves.toMatchObject({ committed_count: 0, status: 'completed' });
  expect(urls.some((url) => url.searchParams.has('withHtmlContent'))).toBe(false);
  expect(urls.some((url) => url.searchParams.get('id') === 'off-highlight')).toBe(false);
});

it('pages only the enabled plain-document categories and preserves their exact category', async () => {
  const categories: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response([]);
    const category = url.searchParams.get('category');
    if (!category) throw new Error(`unexpected exact request: ${url}`);
    categories.push(category);
    return response([readerDocument(`plain-${category}`, category, false)]);
  }) as typeof fetch;
  const base = apiSettings('off');
  const settings = {
    ...base,
    readwiseAutoImportPolicy: {
      ...base.readwiseAutoImportPolicy,
      articleWithoutHighlights: 'inbox' as const,
      emailWithoutHighlights: 'external' as const,
      epubWithoutHighlights: 'inbox' as const,
      pdfWithoutHighlights: 'external' as const,
      tweetWithoutHighlights: 'inbox' as const
    }
  };

  const preview = await previewReadwiseApiImport(settings, { fetchImpl, minIntervalMs: 0 });

  expect(categories).toEqual(['article', 'email', 'pdf', 'epub', 'tweet']);
  expect(preview).toMatchObject({ external_count: 2, inbox_count: 3, total_count: 5 });
  expect(preview.entries.map((entry) => entry.source_kind).sort()).toEqual(
    ['article', 'email', 'epub', 'pdf', 'tweet']
  );
});

it('routes all seven highlighted parent categories without treating annotations as parents', async () => {
  const parentCategories = new Map([
    ['article-doc', 'article'], ['email-doc', 'email'], ['rss-doc', 'rss'],
    ['pdf-doc', 'pdf'], ['epub-doc', 'epub'], ['video-doc', 'video'], ['tweet-doc', 'tweet']
  ]);
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([...parentCategories].map(([documentId]) =>
        exportBook(documentId, `${documentId}-highlight`, 'articles')));
    }
    const id = url.searchParams.get('id') ?? '';
    const category = parentCategories.get(id);
    return category ? response([readerDocument(id, category, false)]) : response([]);
  }) as typeof fetch;
  const base = apiSettings('off');
  const settings = {
    ...base,
    readwiseAutoImportPolicy: {
      ...base.readwiseAutoImportPolicy,
      rssWithHighlights: 'external' as const,
      videoWithHighlights: 'off' as const
    }
  };

  const preview = await previewReadwiseApiImport(settings, { fetchImpl, minIntervalMs: 0 });

  expect(preview).toMatchObject({ external_count: 1, inbox_count: 5, total_count: 6 });
  expect(preview.entries.map((entry) => entry.source_kind).sort()).toEqual(
    ['article', 'email', 'epub', 'pdf', 'rss', 'tweet']
  );
});

it('treats a note attached through a stable highlight parent as annotated content', async () => {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) {
      return response([{
        category: 'articles', external_id: 'email-doc', source: 'reader',
        highlights: [{ external_id: 'email-highlight', note: 'Only note', text: '' }]
      }]);
    }
    const id = url.searchParams.get('id');
    if (id === 'email-highlight') {
      return response([{ category: 'highlight', id, parent_id: 'email-doc' }]);
    }
    if (id === 'email-doc') return response([readerDocument(id, 'email')]);
    throw new Error(`unexpected note request: ${url}`);
  }) as typeof fetch;

  await expect(runReadwiseApiImport({
    dependencies: { fetchImpl, minIntervalMs: 0 }, settings: apiSettings('off')
  })).resolves.toMatchObject({ annotation_count: 1, committed_count: 1, status: 'completed' });
});

it('blocks preview and candidate scope creation while cutover is not terminal', async () => {
  writeLegacyReadwiseSourceCutover({
    completedAt: '2026-09-10T00:00:00.000Z', completedCandidateCount: 0,
    migratedCount: 0, sourceHost: 'desktop-test', startedAt: '2026-09-10T00:00:00.000Z',
    status: 'migration-in-progress', totalCandidateCount: null, unmatchedCount: 0
  });
  const fetchImpl = vi.fn() as typeof fetch;

  await expect(previewReadwiseApiImport(apiSettings('off'), { fetchImpl, minIntervalMs: 0 }))
    .rejects.toThrow('readwise_api_scope_blocked_by_migration');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) count FROM readwise_api_import_stage'
  )).toEqual({ count: 0 });
});

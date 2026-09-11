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
import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { deleteReadwiseApiCandidateRun } from '../database/readwiseApiCandidateRun.js';
import { clearReadwiseApiCandidateStage } from '../database/readwiseApiCandidateStage.js';
import {
  loadReadwiseApiAnnotationLedger,
  loadReadwiseApiExportIndex,
  loadReadwiseApiReaderIndex
} from '../database/readwiseApiIndexStage.js';

import { ensureReadwiseApiCandidateIndex } from './readwiseApiCandidateFetch.js';
import { response } from './readwiseApiImportRun.testSupport.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-index-ledger-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reproduces the fixed 228-request and 249-candidate snapshot ledger', async () => {
  const fixture = fixedSnapshot();
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) return response(fixture.exportBooks);
    const category = url.searchParams.get('category');
    if (category === 'highlight') {
      const page = Number(url.searchParams.get('pageCursor') ?? 0);
      return response(fixture.highlightPages[page] ?? [], page < 15 ? String(page + 1) : null);
    }
    if (category === 'note') return response(fixture.notes);
    if (category === 'pdf') return response(fixture.pdfs);
    if (category === 'epub') return response(fixture.epubs);
    const id = url.searchParams.get('id');
    if (id) return response([parent(id, 'article')]);
    throw new Error(`unexpected request:${url}`);
  }) as typeof fetch;

  const candidates = await ensureReadwiseApiCandidateIndex(settings(), 'connection', {
    fetchImpl,
    minIntervalMs: 0
  });

  expect(urls.filter((url) => url.pathname.includes('/api/v3/list/'))).toHaveLength(227);
  expect(urls.filter((url) => url.pathname.includes('/api/v2/export/'))).toHaveLength(1);
  expect(urls).toHaveLength(228);
  expect(candidates).toHaveLength(249);
  expect(candidates.filter((item) => item.hasHighlights)).toHaveLength(220);
  expect(urls.filter((url) => url.searchParams.has('id'))).toHaveLength(208);
  expect(urls.some((url) => url.searchParams.has('includeDeleted'))).toBe(false);
  const v3Highlights = loadReadwiseApiAnnotationLedger('connection').filter(
    (item) => item.category === 'highlight'
  );
  const v2Highlights = loadReadwiseApiExportIndex('connection').flatMap((book) => book.highlights);
  expect(v3Highlights).toHaveLength(1_557);
  expect(v2Highlights).toHaveLength(515);
  const v2Ids = new Set(v2Highlights.map((item) => item.externalId));
  expect(v3Highlights.filter((item) => v2Ids.has(item.remoteId))).toHaveLength(423);
  expect(v3Highlights.filter((item) => !v2Ids.has(item.remoteId))).toHaveLength(1_134);
  expect(v3Highlights.filter((item) => item.contentStatus === 'available')).toHaveLength(423);
  expect(v3Highlights.filter((item) => item.contentStatus === 'unavailable')).toHaveLength(1_134);
});

it('uses five checkpointed base requests and adds only one new tag backfill scope', async () => {
  const firstUrls: URL[] = [];
  await ensureReadwiseApiCandidateIndex(settings(), 'connection', emptyFetch(firstUrls));
  clearReadwiseApiCandidateStage('connection');
  deleteReadwiseApiCandidateRun('connection');

  const baseUrls: URL[] = [];
  await ensureReadwiseApiCandidateIndex(settings(), 'connection', emptyFetch(baseUrls));
  expect(baseUrls).toHaveLength(5);
  expect(baseUrls.every((url) => url.searchParams.has('updatedAfter'))).toBe(true);
  clearReadwiseApiCandidateStage('connection');
  deleteReadwiseApiCandidateRun('connection');

  const tagUrls: URL[] = [];
  await ensureReadwiseApiCandidateIndex(settings('favorite'), 'connection',
    emptyFetch(tagUrls, [parent('tagged', 'article')]));
  expect(tagUrls).toHaveLength(6);
  expect(tagUrls.filter((url) => url.searchParams.get('tag') === 'favorite')).toHaveLength(1);
  expect(tagUrls.find((url) => url.searchParams.get('tag') === 'favorite')
    ?.searchParams.has('updatedAfter')).toBe(false);
  expect(tagUrls.filter((url) => !url.searchParams.has('tag')).every(
    (url) => url.searchParams.has('updatedAfter')
  )).toBe(true);
  expect(loadReadwiseApiReaderIndex('connection')).toContainEqual(
    expect.objectContaining({ id: 'tagged', matchedImportTag: 'favorite' }));
});

it('resumes from a saved scope cursor and fails closed when that cursor is rejected', async () => {
  let fail = true;
  const cursors: Array<string | null> = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.searchParams.get('category') === 'highlight') {
      const cursor = url.searchParams.get('pageCursor');
      cursors.push(cursor);
      if (!cursor) return response([], 'cursor-1');
      if (fail) return new Response('{}', { status: 500 });
      return new Response('{}', { status: 400 });
    }
    return response([]);
  }) as typeof fetch;

  await expect(ensureReadwiseApiCandidateIndex(settings(), 'connection', {
    fetchImpl, minIntervalMs: 0
  })).rejects.toThrow('readwise_api_http_500');
  fail = false;
  await expect(ensureReadwiseApiCandidateIndex(settings(), 'connection', {
    fetchImpl, minIntervalMs: 0
  })).rejects.toThrow('readwise_api_scope_cursor_invalid:reader:highlight');
  expect(cursors).toEqual([null, 'cursor-1', 'cursor-1']);
});

it('does not refetch the parent body when an incremental highlight belongs to an imported document', async () => {
  materializeReadwiseApiDocument({
    config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection',
    destination: 'inbox',
    document: {
      annotations: [], body: 'Existing body', category: 'article', coverImageUrl: null,
      degradedReason: null, id: 'known',
      metadata: { author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'Known' },
      title: 'Known', unmatchedAnnotationCount: 0, updatedAt: '2026-09-10T00:00:00.000Z'
    }
  });
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) return response([{
      external_id: 'known', highlights: [{ external_id: 'new-highlight', text: 'New' }], source: 'reader'
    }]);
    if (url.searchParams.get('category') === 'highlight') {
      return response([{ category: 'highlight', id: 'new-highlight', parent_id: 'known' }]);
    }
    return response([]);
  }) as typeof fetch;

  const candidates = await ensureReadwiseApiCandidateIndex(settings(), 'connection', {
    fetchImpl, minIntervalMs: 0
  });
  expect(candidates).toEqual([expect.objectContaining({ documentId: 'known', hasHighlights: true })]);
  expect(urls.some((url) => url.searchParams.has('id'))).toBe(false);
});

function emptyFetch(urls: URL[], tagged: unknown[] = []) {
  return {
    fetchImpl: vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url);
      return response(url.searchParams.has('tag') ? tagged : []);
    }) as typeof fetch,
    minIntervalMs: 0
  };
}

function settings(importTag = '') {
  const value = createDefaultImportManagerSettings();
  return { ...value, readwiseAutoImportPolicy: { ...value.readwiseAutoImportPolicy, importTag } };
}

function fixedSnapshot() {
  const highlights = Array.from({ length: 1_557 }, (_, index) => ({
    category: 'highlight',
    id: `highlight-${index}`,
    parent_id: `parent-${index < 423 ? index % 68 : index % 220}`,
    updated_at: '2026-09-11T00:00:00.000Z'
  }));
  const groups = new Map<string, unknown[]>();
  for (let index = 0; index < 515; index += 1) {
    const documentId = `parent-${index % 68}`;
    const current = groups.get(documentId) ?? [];
    current.push({ external_id: index < 423 ? `highlight-${index}` : `v2-only-${index}`, text: `Text ${index}` });
    groups.set(documentId, current);
  }
  return {
    epubs: Array.from({ length: 21 }, (_, index) => parent(`epub-${index}`, 'epub')),
    exportBooks: [...groups].map(([external_id, bookHighlights]) => ({
      category: 'articles', external_id, highlights: bookHighlights, source: 'reader'
    })),
    highlightPages: Array.from({ length: 16 }, (_, page) => highlights.slice(page * 100, (page + 1) * 100)),
    notes: Array.from({ length: 74 }, (_, index) => ({
      category: 'note', id: `note-${index}`, parent_id: `highlight-${index}`
    })),
    pdfs: [
      ...Array.from({ length: 12 }, (_, index) => parent(`parent-${index}`, 'pdf')),
      ...Array.from({ length: 8 }, (_, index) => parent(`pdf-${index}`, 'pdf'))
    ]
  };
}

function parent(id: string, category: string) {
  return { category, html_content: `<p>${id}</p>`, id, title: id };
}

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
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../database/readwiseRemoteIdentity.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../database/readwiseRemoteIdentity.js')>()),
  loadReadwiseRemoteSource: () => ({
    connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1
  })
}));
vi.mock('./readwiseApiConnectionState.js', () => ({
  loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'secret-ref', state: 'connected' }, readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'SECRET' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { loadReadwiseApiAnnotationLedger } from '../database/readwiseApiIndexStage.js';

import { ensureReadwiseApiCandidateIndex } from './readwiseApiCandidateFetch.js';
import { response } from './readwiseApiImportRun.testSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-note-parent-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('attaches a note directly when its declared parent is an article', async () => {
  const urls: URL[] = [];
  const candidates = await ensureReadwiseApiCandidateIndex(settings(), 'connection', scopedFetch(urls, {
    ids: { 'article-1': [parent('article-1')] },
    note: [note('note-1', 'article-1')]
  }));
  expect(ids(urls, 'article-1')).toHaveLength(1);
  expect(candidates).toEqual([expect.objectContaining({
    documentId: 'article-1', hasHighlights: false, highlightIds: [], noteIds: ['note-1']
  })]);
  expect(ledger('note-1')).toMatchObject({ documentId: 'article-1', parentId: 'article-1' });
});

it('keeps the note on its article when the missing parent is a highlight', async () => {
  const candidates = await ensureReadwiseApiCandidateIndex(settings(), 'connection', scopedFetch([], {
    article: [parent('article-1')],
    ids: { 'highlight-1': [highlight('highlight-1', 'article-1')] },
    note: [note('note-1', 'highlight-1')]
  }));
  expect(candidates).toEqual([expect.objectContaining({
    documentId: 'article-1', hasHighlights: true,
    highlightIds: ['highlight-1'], noteIds: ['note-1']
  })]);
});

it('rejects a declared parent that is neither a highlight nor an article', async () => {
  await expect(ensureReadwiseApiCandidateIndex(settings(), 'connection', scopedFetch([], {
    ids: { 'wrong-parent': [note('wrong-parent', 'other')] },
    note: [note('note-1', 'wrong-parent')]
  }))).rejects.toThrow('readwise_api_annotation_parent_identity_conflict:wrong-parent');
});

function scopedFetch(urls: URL[], values: {
  article?: unknown[]; ids?: Record<string, unknown[]>; note?: unknown[];
}) {
  return {
    fetchImpl: vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url);
      if (url.pathname.includes('/v2/export/')) return response([]);
      const id = url.searchParams.get('id');
      if (id) return response(values.ids?.[id] ?? []);
      if (url.searchParams.get('category') === 'article') return response(values.article ?? []);
      if (url.searchParams.get('category') === 'note') return response(values.note ?? []);
      return response([]);
    }) as typeof fetch,
    minIntervalMs: 0
  };
}

function settings() {
  const value = createDefaultImportManagerSettings();
  value.readwiseAutoImportPolicy.articleWithoutHighlights = 'inbox';
  return value;
}

function ledger(remoteId: string) {
  return loadReadwiseApiAnnotationLedger('connection').find((item) => item.remoteId === remoteId);
}

function ids(urls: URL[], id: string) {
  return urls.filter((url) => url.searchParams.get('id') === id);
}

function note(id: string, parentId: string) {
  return { category: 'note', id, parent_id: parentId };
}

function highlight(id: string, parentId: string) {
  return { category: 'highlight', id, parent_id: parentId };
}

function parent(id: string) {
  return { category: 'article', html_content: `<p>${id}</p>`, id, title: id };
}

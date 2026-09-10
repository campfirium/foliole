// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'test', hasReadwiseApiSecret: () => true }));

import { createDefaultReadwiseHostSettings } from '../../lib/core/import/readwiseHostSettings.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { softDeleteNodes } from '../database/nodeMutations.js';
import { createReadwiseRemoteSource, saveReadwiseConnectionState } from '../database/readwiseRemoteIdentity.js';
import { loadReadwiseSourceCutover, writeReadwiseSourceCutover } from '../database/readwiseSourceCutover.js';

import { importReadwiseManualSource } from './readwiseManualImport.js';
import { normalizeReadwiseSearchQuery, prepareReadwiseManualSearch, searchReadwiseManualSources } from './readwiseManualSearch.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-manual-search-'));
  initializeDatabase();
  const source = createReadwiseRemoteSource('2026-09-10T00:00:00Z');
  saveReadwiseConnectionState({ ...createDefaultReadwiseHostSettings(), readwiseSourceMode: 'api',
    apiConnection: { state: 'connected', secretRef: 'readwise-api-00000000-0000-4000-8000-000000000016.bin', verifiedAt: '2026-09-10T00:00:00Z' }
  }, source, '2026-09-10T00:00:00Z');
});
afterEach(async () => { closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

function fetchFixture(requests: URL[], fail = false) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input)); requests.push(url);
    if (fail) return new Response('', { status: 500 });
    if (url.pathname === '/api/v2/export/') return Response.json({ results: [], nextPageCursor: null });
    const id = url.searchParams.get('id');
    const document = (value: string) => ({ id: value, category: 'article', title: `Title ${value}`,
      author: 'Test Author', created_at: '2026-09-10T01:00:00Z',
      ...(url.searchParams.has('withHtmlContent') ? { html_content: '<p>Readable body</p>' } : {}) });
    if (id) return Response.json({ results: [document(id)], nextPageCursor: null });
    if (url.searchParams.get('category') !== 'article') return Response.json({ results: [], nextPageCursor: null });
    return Response.json({ results: [document(url.searchParams.has('pageCursor') ? 'second' : 'first')],
      nextPageCursor: url.searchParams.has('pageCursor') ? null : 'page-2' });
  }) as typeof fetch;
}

it('publishes complete metadata only, normalizes queries, and never writes sync candidates', async () => {
  const requests: URL[] = [];
  const dependencies = { fetchImpl: fetchFixture(requests), minIntervalMs: 0 };
  expect(normalizeReadwiseSearchQuery('  ＴＥＳＴ   Author ')).toBe('test author');
  expect(searchReadwiseManualSources('Title')).toEqual({ status: 'preparing', sources: [] });
  await prepareReadwiseManualSearch(dependencies);
  expect(searchReadwiseManualSources(' ')).toEqual({ status: 'ready', sources: [] });
  expect(searchReadwiseManualSources('Test Author').sources).toHaveLength(2);
  expect(searchReadwiseManualSources('second').sources[0]?.title).toBe('Title second');
  expect(searchReadwiseManualSources('missing').sources).toEqual([]);
  expect(requests.every((url) => !url.searchParams.has('withHtmlContent') && !url.searchParams.has('withRawSourceUrl'))).toBe(true);
  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT COUNT(*) count FROM readwise_api_import_stage')).toEqual({ count: 0 });
  expect(driver.queryOne('SELECT COUNT(*) count FROM external_documents')).toEqual({ count: 0 });
});

it('never exposes partial matches after an indexing failure and can rebuild', async () => {
  await expect(prepareReadwiseManualSearch({ fetchImpl: fetchFixture([], true), minIntervalMs: 0 })).rejects.toThrow();
  expect(searchReadwiseManualSources('Title')).toEqual({ status: 'preparing', sources: [] });
  await prepareReadwiseManualSearch({ fetchImpl: fetchFixture([]), minIntervalMs: 0 });
  expect(searchReadwiseManualSources('Title').sources).toHaveLength(2);
});

it('adopts Off sources once, retains deletion blocking until explicit reimport, and recognizes the new binding', async () => {
  const requests: URL[] = [];
  const dependencies = { fetchImpl: fetchFixture(requests), minIntervalMs: 0 };
  await prepareReadwiseManualSearch(dependencies);
  const [first, duplicate] = await Promise.all([
    importReadwiseManualSource('api:first', false, dependencies),
    importReadwiseManualSource('api:first', false, dependencies)
  ]);
  expect(first).toEqual(duplicate);
  expect(first.status).toBe('imported');
  closeDatabaseConnection();
  initializeDatabase();
  await prepareReadwiseManualSearch(dependencies);
  expect(searchReadwiseManualSources('first').sources[0]?.status).toBe('imported');
  const before = requests.length;
  expect(await importReadwiseManualSource('api:first', false, dependencies)).toEqual(first);
  expect(requests).toHaveLength(before);
  softDeleteNodes({ nodeIds: [first.node_id!], deletedAt: '2026-09-10T02:00:00Z' });
  expect(await importReadwiseManualSource('api:first', false, dependencies)).toMatchObject({ status: 'reimport_required' });
  const restored = await importReadwiseManualSource('api:first', true, dependencies);
  expect(restored.status).toBe('imported');
  expect(searchReadwiseManualSources('first').sources[0]?.status).toBe('imported');
  expect(openDatabaseConnection().driver.queryOne('SELECT COUNT(*) count FROM import_sources')).toEqual({ count: 1 });
});

it('leaves completed cutover suppression unchanged and performs no body request', async () => {
  const requests: URL[] = [];
  const dependencies = { fetchImpl: fetchFixture(requests), minIntervalMs: 0 };
  writeReadwiseSourceCutover({ annotations: [], cohortDocumentIds: ['first'], completedAt: '2026-09-10T00:00:00Z',
    documents: [{ remoteId: 'first', nodeId: null, status: 'suppressed' }], retiredNodeIds: [],
    sourceHost: 'test', startedAt: '2026-09-09T00:00:00Z', status: 'api' });
  const journal = loadReadwiseSourceCutover();
  await prepareReadwiseManualSearch(dependencies);
  const count = requests.length;
  expect(searchReadwiseManualSources('first').sources[0]?.status).toBe('suppressed');
  expect(await importReadwiseManualSource('api:first', true, dependencies)).toEqual({ status: 'suppressed', node_id: null });
  expect(requests).toHaveLength(count);
  expect(loadReadwiseSourceCutover()).toEqual(journal);
});

it('recognizes permanently removed nodes and requires explicit reimport with the same source binding', async () => {
  const dependencies = { fetchImpl: fetchFixture([]), minIntervalMs: 0 };
  await prepareReadwiseManualSearch(dependencies);
  const imported = await importReadwiseManualSource('api:first', false, dependencies);
  openDatabaseConnection().driver.execute('DELETE FROM nodes WHERE id = ?', [imported.node_id!]);
  expect(searchReadwiseManualSources('first').sources[0]?.status).toBe('deleted');
  expect((await importReadwiseManualSource('api:first', false, dependencies)).status).toBe('reimport_required');
  expect((await importReadwiseManualSource('api:first', true, dependencies)).status).toBe('imported');
  expect(openDatabaseConnection().driver.queryOne('SELECT COUNT(*) count FROM import_sources')).toEqual({ count: 1 });
});

it('blocks a retired bound node before fetching and preserves the completed journal', async () => {
  const requests: URL[] = [];
  const dependencies = { fetchImpl: fetchFixture(requests), minIntervalMs: 0 };
  await prepareReadwiseManualSearch(dependencies);
  const imported = await importReadwiseManualSource('api:first', false, dependencies);
  writeReadwiseSourceCutover({ annotations: [], cohortDocumentIds: ['first'], completedAt: '2026-09-10T00:00:00Z',
    documents: [{ remoteId: 'first', nodeId: imported.node_id, status: 'bound' }], retiredNodeIds: [imported.node_id!],
    sourceHost: 'test', startedAt: '2026-09-09T00:00:00Z', status: 'api' });
  const journal = loadReadwiseSourceCutover();
  const count = requests.length;
  expect(searchReadwiseManualSources('first').sources[0]?.status).toBe('suppressed');
  expect((await importReadwiseManualSource('api:first', true, dependencies)).status).toBe('suppressed');
  expect(requests).toHaveLength(count);
  expect(loadReadwiseSourceCutover()).toEqual(journal);
});

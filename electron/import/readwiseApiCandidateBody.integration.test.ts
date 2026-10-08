// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs') })
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../database/readwiseRemoteIdentity.js', async (original) => ({
  ...(await original<typeof import('../database/readwiseRemoteIdentity.js')>()),
  loadReadwiseRemoteSource: () => ({ connectionRef: 'connection', createdAt: 'created', updatedAt: 'updated', version: 1 })
}));
vi.mock('./readwiseApiConnectionState.js', () => ({ loadStoredReadwiseHostSettings: () => ({
  apiConnection: { secretRef: 'test-secret', state: 'connected' }, readwiseSourceMode: 'api'
}) }));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'TEST' }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDesktopDeviceProfileFixture } from '../database/deviceIdentityTestSupport.js';
import { saveReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseApiReaderIndex } from '../database/readwiseApiIndexStage.js';

import { fetchReadwiseApiCandidateFacts } from './readwiseApiCandidateFetch.js';
import { resolveAndSaveReadwiseApiCandidateParent } from './readwiseApiCandidateParent.js';
import { buildReadwiseApiCandidatePreview } from './readwiseApiCandidatePreview.js';
import type { ReadwiseApiCandidate } from './readwiseApiCandidateTypes.js';
import { previewReadwiseApiImport, runReadwiseApiImport } from './readwiseApiImportRun.js';
import { apiSettings, response } from './readwiseApiImportRun.testSupport.js';
import { materializeReadwiseApiDocument } from './readwiseApiMaterialization.js';

let root = '';
const body = '<p>Local 中文 😀\u0000 body</p>';
const candidate: ReadwiseApiCandidate = { destination: 'external', documentId: 'article-1',
  exportCategory: null, hasHighlights: false, highlightIds: [], readerCategory: 'article',
  status: 'pending', title: 'Local article' };

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-candidate-body-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('reuses complete owned local candidate parent facts and preserves preview routing', async () => {
  const { driver, sqlite } = openDatabaseConnection();
  sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const settings = apiSettings();
  materializeReadwiseApiDocument({ config: settings.readwiseReaderConfig,
    connectionRef: 'connection', destination: 'inbox', document: documentFixture() });
  saveReadwiseApiCandidates('connection', [candidate]);
  const fetchImpl = vi.fn(async () => { throw new Error('unexpected_remote_parent_fetch'); });
  expect(await fetchReadwiseApiCandidateFacts('connection', candidate, { fetchImpl })).toBe('ready');
  expect(fetchImpl).not.toHaveBeenCalled();
  const fact = driver.queryOne<{ payload_json: string }>(
    "SELECT payload_json FROM readwise_api_import_stage WHERE record_kind = 'candidate-reader-v3' AND remote_id = ?", ['article-1']
  );
  expect(JSON.parse(fact?.payload_json ?? '{}')).toMatchObject({ id: 'article-1', htmlContent: body });
  let resolved = 0;
  expect(await resolveAndSaveReadwiseApiCandidateParent({ connectionRef: 'connection', id: 'article-1',
    includeContent: true, onResolved: () => { resolved += 1; }, request: async () => { throw new Error('unexpected_request'); },
    runStartedAt: '2026-10-08T00:00:00.000Z', settings })).toMatchObject({ htmlContent: body });
  expect(resolved).toBe(1);
  expect(loadReadwiseApiReaderIndex('connection')).toEqual([expect.objectContaining({ id: 'article-1', htmlContent: body })]);
  expect(buildReadwiseApiCandidatePreview(settings, 'connection', [candidate]).entries)
    .toEqual([expect.objectContaining({ destination: 'inbox', status: 'updated', remote_document_id: 'article-1' })]);
  const scopeFetch = vi.fn(async (url: string | URL | Request) => response(
    new URL(String(url)).searchParams.get('category') === 'highlight'
      ? [{ id: 'remote-highlight', category: 'highlight', parent_id: 'article-1', html_content: '<p>Note</p>' }] : []
  ));
  const preview = await previewReadwiseApiImport(settings, { fetchImpl: scopeFetch, minIntervalMs: 0 });
  expect(preview.entries).toEqual([expect.objectContaining({ destination: 'inbox', status: 'updated' })]);
  expect(scopeFetch.mock.calls.every(([url]) => !new URL(String(url)).searchParams.has('id'))).toBe(true);
  const source = driver.queryOne<{ latest_node_id: string }>("SELECT latest_node_id FROM import_sources WHERE remote_document_id = 'article-1'")!;
  expect(loadNodeBodyResolution(driver, source.latest_node_id)).toMatchObject({ content: body });

});

function documentFixture(): PreparedReadwiseApiDocument {
  return { annotations: [], body, category: 'article', coverImageUrl: null, degradedReason: null,
    id: 'article-1', metadata: { author: null, category: 'article', readerUrl: null, sourceUrl: null, title: 'Local article' },
    title: 'Local article', unmatchedAnnotationCount: 0, updatedAt: '2026-10-08T00:00:00.000Z' };
}

it('runs candidates with owned bodies through indexing, local reuse and document commit', async () => {
  const { driver, sqlite } = openDatabaseConnection();
  sqlite.exec('DELETE FROM content_blob_data; DELETE FROM content_blobs');
  const settings = apiSettings();
  materializeReadwiseApiDocument({ config: settings.readwiseReaderConfig,
    connectionRef: 'connection', destination: 'inbox', document: documentFixture() });
  let withHighlight = false;
  const requestedIds: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.includes('/v2/export/')) return response(withHighlight ? [{
      external_id: 'article-1', category: 'articles', source: 'reader',
      highlights: [{ external_id: 'new-highlight', text: 'Local' }]
    }] : []);
    if (url.searchParams.get('category') === 'article') return response([
      { id: 'article-1', category: 'article', title: 'Local article' },
      { id: 'new-article', category: 'article', title: 'New article' }
    ]);
    if (url.searchParams.get('category') === 'highlight') return response(withHighlight ? [
      { id: 'new-highlight', category: 'highlight', parent_id: 'article-1', html_content: '<p>Local</p>' }
    ] : []);
    if (url.searchParams.has('category')) return response([]);
    const id = url.searchParams.get('id');
    if (id !== 'new-article') throw new Error('unexpected_parent_request');
    requestedIds.push(id);
    return response([{ id, category: 'article', title: 'New article', html_content: '<p>Remote new body</p>' }]);
  });
  const input = { settings, dependencies: { fetchImpl, minIntervalMs: 0 } };
  await expect(runReadwiseApiImport(input)).resolves.toMatchObject({ committed_count: 1, skipped_count: 1, status: 'completed' });
  expect(requestedIds).toEqual(['new-article']);
  const sources = driver.queryAll<{ latest_node_id: string; remote_document_id: string }>(
    'SELECT latest_node_id, remote_document_id FROM import_sources WHERE remote_provider = ?', ['readwise']
  );
  expect(sources).toHaveLength(2);
  const existing = sources.find((row) => row.remote_document_id === 'article-1')!;
  const created = sources.find((row) => row.remote_document_id === 'new-article')!;
  expect(loadNodeBodyResolution(driver, created.latest_node_id)).toMatchObject({
    content: '---\ncategory: article\nfull_title: New article\nid: new-article\n---\n# New article\n\nRemote new body'
  });
  withHighlight = true;
  requestedIds.length = 0;
  await expect(runReadwiseApiImport(input)).resolves.toMatchObject({ committed_count: 1, skipped_count: 1, status: 'completed' });
  expect(requestedIds).toEqual([]);
  expect(loadNodeBodyResolution(driver, existing.latest_node_id)).toMatchObject({ content: body });
  const highlight = driver.queryOne<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND anchor_link IS NOT NULL', [existing.latest_node_id])!;
  expect(loadNodeBodyResolution(driver, highlight.id)).toMatchObject({ content: 'Local' });
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

// @vitest-environment node
import './readwisePagination.testSupport.js';

import { expect, it } from 'vitest';

import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateReadwiseApiImportRun, loadStagedReadwiseApiContracts } from '../database/readwiseApiImportState.js';
import { loadReadwiseApiReconcileRun } from '../database/readwiseApiReconcileState.js';

import { fetchReadwiseApiImportRound } from './readwiseApiImportFetch.js';
import { response } from './readwiseApiImportRun.testSupport.js';
import { cancelReadwiseApiReconcile, runReadwiseApiReconcile } from './readwiseApiReconcile.js';
import { downloadReadwiseCutover } from './readwiseCutoverDownload.js';
import { fetchReadwiseIdentityEvidence } from './readwiseIdentityApi.js';

it('keeps the import phase and staged records on a bad page, then resumes', async () => {
  await expect(fetchReadwiseApiImportRound('connection', { minIntervalMs: 0, fetchImpl: async (input) => {
    return new URL(String(input)).searchParams.has('pageCursor')
      ? Response.json({ nextPageCursor: null }) : response([{ id: 'doc', category: 'article' }], 'resume');
  } })).rejects.toThrow('readwise_api_page_invalid');
  expect(loadOrCreateReadwiseApiImportRun('connection')).toMatchObject({ phase: 'reader', readerCursor: 'resume' });
  expect(loadStagedReadwiseApiContracts('connection').readerDocuments).toHaveLength(1);
  expect(await fetchReadwiseApiImportRound('connection', {
    minIntervalMs: 0, fetchImpl: async () => response([])
  })).toMatchObject({ phase: 'ready' });
  expect(loadStagedReadwiseApiContracts('connection').readerDocuments).toHaveLength(1);
});

it('rejects cycles in the import fetch path', async () => {
  let requests = 0;
  await expect(fetchReadwiseApiImportRound('connection', { minIntervalMs: 0, fetchImpl: async () => {
    return response([], ++requests < 3 ? 'same' : null);
  } })).rejects.toThrow('readwise_api_cursor_cycle');
  expect(requests).toBe(2);
});

it('does not complete a cutover page with a missing cursor and resumes its saved page', async () => {
  let requests = 0;
  await expect(downloadReadwiseCutover('connection', async () => {
    return ++requests === 1 ? { results: [], nextPageCursor: 'reader-next' } : { results: [] };
  }, {})).rejects.toThrow('readwise_api_page_invalid');
  expect(loadOrCreateReadwiseApiImportRun('connection').phase).not.toBe('ready');
  const urls: URL[] = [];
  const result = await downloadReadwiseCutover('connection', async (url) => {
    urls.push(url); return { results: [], nextPageCursor: null };
  }, {});
  expect(result.phase).toBe('ready');
  expect(urls.some((url) => url.searchParams.get('pageCursor') === 'reader-next')).toBe(true);
});

it('does not complete identity evidence on a malformed export page', async () => {
  await expect(fetchReadwiseIdentityEvidence({ ids: [], token: 'fixture', minIntervalMs: 0,
    fetchImpl: async () => Response.json({ results: [] })
  })).rejects.toThrow('readwise_api_page_invalid');
});

it.each(['bad-page', 'cancel'] as const)('preserves remote lifecycle on reconcile %s and commits only a full retry', async (failure) => {
  const driver = openDatabaseConnection().driver;
  const state = JSON.stringify({ version: 2, annotations: [], remoteLifecycle: {
    checkedAt: 'previous', connectionRef: 'connection', reader: 'present', export: 'present',
    scope: { readerLocation: 'all', version: 1 }
  } });
  driver.execute(`INSERT INTO import_sources (
    source_fingerprint, provider, source_kind, source_name, source_locator, first_imported_at,
    last_imported_at, last_content_fingerprint, remote_provider, remote_connection_ref,
    remote_document_id, remote_import_state_json
  ) VALUES ('source','desktop_text_file','html','Title','readwise://doc','old','old','hash',
    'readwise','connection','doc',?)`, [state]);
  const readState = () => driver.queryOne<{ remote_import_state_json: string }>(
    "SELECT remote_import_state_json FROM import_sources WHERE source_fingerprint = 'source'"
  )?.remote_import_state_json;
  const result = await runReadwiseApiReconcile({ dependencies: { minIntervalMs: 0, fetchImpl: async (input) => {
    if (!new URL(String(input)).searchParams.has('pageCursor')) return response([], 'next');
    if (failure === 'cancel') { cancelReadwiseApiReconcile(); return response([]); }
    return Response.json({ nextPageCursor: null });
  } } });
  expect(result.status).toBe(failure === 'cancel' ? 'cancelled' : 'failed');
  expect(readState()).toBe(state);
  expect(loadReadwiseApiReconcileRun('connection')?.phase).not.toBe('ready');
  const completed = await runReadwiseApiReconcile({ dependencies: {
    minIntervalMs: 0, fetchImpl: async () => response([])
  } });
  expect(completed).toMatchObject({ status: 'completed', reader_missing_count: 1 });
  expect(JSON.parse(readState() ?? '{}').remoteLifecycle.reader).toBe('missing');
});

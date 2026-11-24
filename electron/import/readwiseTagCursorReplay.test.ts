// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';
import { loadReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

import { buildReadwiseApiCandidateIndex } from './readwiseApiCandidateIndex.js';
import { runReadwiseApiCandidatePipeline } from './readwiseApiCandidatePipeline.js';
import { apiSettings, readerDocument, response } from './readwiseApiImportRun.testSupport.js';

let connection: ReturnType<typeof openNodeSqliteFixture>;
vi.mock('electron', () => ({}));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => connection,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({ canCurrentHostRunReadwise: () => true }));
vi.mock('../database/readwiseRemoteIdentity.js', async importOriginal => ({
  ...await importOriginal<typeof import('../database/readwiseRemoteIdentity.js')>(),
  loadReadwiseRemoteSource: () => ({ connectionRef: 'connection' })
}));
vi.mock('./readwiseApiConnectionState.js', () => ({
  loadStoredReadwiseHostSettings: () => ({
    apiConnection: { secretRef: 'test', state: 'connected' },
    readwiseSourceMode: 'api'
  })
}));
vi.mock('./readwiseApiSecret.js', () => ({ readReadwiseApiSecret: () => 'fixture-token' }));

beforeEach(() => { connection = openNodeSqliteFixture(); });
afterEach(() => connection.sqlite.close());

const settings = apiSettings('off');
settings.readwiseAutoImportPolicy.importTag = 'favorite';
const connectionRef = 'connection';

function tagged(id: string) {
  return { ...readerDocument(id, 'article'), tags: { favorite: { name: 'Favorite' } } };
}

it('imports only currently tagged articles after Reader rejects the saved tag cursor', async () => {
  let interrupted = true;
  const cursors: Array<string | null> = [];
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.searchParams.has('id')) {
      const id = url.searchParams.get('id')!;
      return response([id === 'still-tagged' ? tagged(id) : readerDocument(id, 'article')]);
    }
    if (!url.searchParams.has('tag')) return response([]);
    const cursor = url.searchParams.get('pageCursor');
    cursors.push(cursor);
    if (interrupted) {
      if (cursor) throw new Error('first tag scan interrupted');
      return response([tagged('tag-removed'), tagged('still-tagged')], 'expired');
    }
    if (cursor) return new Response('{}', { status: 400 });
    return response([tagged('still-tagged')]);
  };
  const run = () => runReadwiseApiCandidatePipeline({
    assertEligible: () => undefined, connectionRef, dependencies: { fetchImpl, minIntervalMs: 0 }, settings
  });
  await expect(run()).rejects.toThrow('first tag scan interrupted');
  interrupted = false;
  const result = await run();
  expect(loadReadwiseApiImportSource(connectionRef, 'tag-removed')?.nodeId ?? null).toBeNull();
  expect(cursors.slice(-2)).toEqual(['expired', null]);
  expect(loadReadwiseApiImportSource(connectionRef, 'still-tagged')?.body).toContain('Body still-tagged');
  expect(result).toMatchObject({ committedCount: 1, remainingCount: 0, totalCount: 1 });
});

it('keeps evidence from a full category scan when the incremental tag cursor must restart', async () => {
  await runReadwiseApiCandidatePipeline({
    assertEligible: () => undefined, connectionRef, settings,
    dependencies: { fetchImpl: async () => response([]), minIntervalMs: 0 }
  });

  const policy = { ...settings.readwiseAutoImportPolicy, articleWithoutHighlights: 'external' as const };
  let interrupted = true;
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.searchParams.get('category') === 'article') {
      expect(url.searchParams.has('updatedAfter')).toBe(false);
      return response([tagged('older-tagged-article')]);
    }
    if (!url.searchParams.has('tag')) return response([]);
    expect(url.searchParams.has('updatedAfter')).toBe(true);
    const cursor = url.searchParams.get('pageCursor');
    if (interrupted) {
      if (cursor) throw new Error('tag scan interrupted');
      return response([], 'expired');
    }
    return cursor ? new Response('{}', { status: 400 }) : response([]);
  };
  const index = () => buildReadwiseApiCandidateIndex({ connectionRef, dependencies: { fetchImpl, minIntervalMs: 0 },
    settings: { ...settings, readwiseAutoImportPolicy: policy } });
  await expect(index()).rejects.toThrow('tag scan interrupted');
  interrupted = false;
  await index();

  const candidates = loadReadwiseApiCandidates(connectionRef);
  expect(candidates.find(candidate => candidate.documentId === 'older-tagged-article'))
    .toMatchObject({ destination: 'inbox', matchedImportTag: true });
});

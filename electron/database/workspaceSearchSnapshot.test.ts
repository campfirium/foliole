import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
  revision: 1,
  search: vi.fn()
}));

vi.mock('./connection.js', () => ({ registerDatabaseConnectionCleanup: vi.fn() }));
vi.mock('./workspaceSearch.js', () => ({ searchWorkspace: mocks.search }));
vi.mock('./searchAliasMirror.js', () => ({
  getEffectiveSearchAliases: () => ({ groups: [['Disney', '迪士尼']], revision: mocks.revision })
}));

import { beginWorkspaceSearch, loadWorkspaceSearchBatch, releaseWorkspaceSearch } from './workspaceSearchSnapshot.js';

beforeEach(() => {
  mocks.revision = 1;
  mocks.search.mockImplementation(() => mocks.results);
  mocks.results = Array.from({ length: 94 }, (_, index) => ({
    aliasMatches: index >= 80 ? [{ spelling: '迪士尼' }] : undefined,
    id: `result-${index}`
  }));
});

it('keeps the full ordered snapshot in desktop runtime and pages matching spellings without requerying', () => {
  const first = beginWorkspaceSearch('Disney');
  expect(first.results).toHaveLength(40);
  expect(first.hasMore).toBe(true);
  expect(first.aliasSpellings).toEqual([{ key: '迪士尼', label: '迪士尼' }]);
  expect(loadWorkspaceSearchBatch(first.snapshotId, 40).results[0]).toMatchObject({ id: 'result-40' });
  expect(loadWorkspaceSearchBatch(first.snapshotId, 80).results.at(-1)).toMatchObject({ id: 'result-93' });
  expect(loadWorkspaceSearchBatch(first.snapshotId, 0, '迪士尼').results).toHaveLength(14);
  expect(mocks.search).toHaveBeenCalledTimes(1);
});

it('rejects old batches after a new query or alias revision and releases the active snapshot', () => {
  const first = beginWorkspaceSearch('Disney');
  const second = beginWorkspaceSearch('迪士尼');
  expect(loadWorkspaceSearchBatch(first.snapshotId, 40).results).toEqual([]);
  mocks.revision = 2;
  expect(loadWorkspaceSearchBatch(second.snapshotId, 40).results).toEqual([]);
  mocks.revision = 1;
  releaseWorkspaceSearch(second.snapshotId);
  expect(loadWorkspaceSearchBatch(second.snapshotId, 40).results).toEqual([]);
});

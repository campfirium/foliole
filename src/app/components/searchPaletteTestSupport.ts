import type { WorkspaceSearchResult } from './workspaceSearch';

export function searchSnapshot(results: WorkspaceSearchResult[]) {
  return { aliasSpellings: [], hasMore: false, results, revision: 0, snapshotId: 'test-snapshot' };
}

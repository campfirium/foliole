import { randomUUID } from 'node:crypto';

import { normalizeSearchAlias } from '../../lib/core/search/searchAliasDocument.js';
import type { NativeWorkspaceSearchResult } from '../../lib/platform/nativeStorageContract.js';

import { registerDatabaseConnectionCleanup } from './connection.js';
import { getEffectiveSearchAliases } from './searchAliasMirror.js';
import { searchWorkspace } from './workspaceSearch.js';

const BATCH_SIZE = 40;
let activeSnapshot: { id: string; results: NativeWorkspaceSearchResult[]; revision: number } | null = null;

export function beginWorkspaceSearch(query: string) {
  const results = searchWorkspace(query) as NativeWorkspaceSearchResult[];
  const snapshot = { id: randomUUID(), results, revision: getEffectiveSearchAliases().revision };
  activeSnapshot = snapshot;
  const matchedSpellings = [...new Set(results.flatMap((result) =>
    result.aliasMatches?.map((match) => match.spelling) ?? []
  ))];
  const displaySpelling = new Map(getEffectiveSearchAliases().groups.flat().map((value) => [normalizeSearchAlias(value), value]));
  return {
    aliasSpellings: matchedSpellings.map((key) => ({ key, label: displaySpelling.get(key) ?? key })),
    hasMore: results.length > BATCH_SIZE,
    results: results.slice(0, BATCH_SIZE),
    revision: snapshot.revision,
    snapshotId: snapshot.id
  };
}

export function loadWorkspaceSearchBatch(snapshotId: string, offset: number, spelling: string | null = null) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid search result offset.');
  const snapshot = activeSnapshot?.id === snapshotId ? activeSnapshot : null;
  if (!snapshot || snapshot.revision !== getEffectiveSearchAliases().revision) {
    return { hasMore: false, results: [] };
  }
  const results = spelling
    ? snapshot.results.filter((result) => result.aliasMatches?.some((match) => match.spelling === spelling))
    : snapshot.results;
  return {
    hasMore: offset + BATCH_SIZE < results.length,
    results: results.slice(offset, offset + BATCH_SIZE)
  };
}

export function releaseWorkspaceSearch(snapshotId: string) {
  if (activeSnapshot?.id === snapshotId) activeSnapshot = null;
}

registerDatabaseConnectionCleanup(() => { activeSnapshot = null; });

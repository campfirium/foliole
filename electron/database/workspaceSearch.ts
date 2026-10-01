import { searchWorkspace as searchWorkspaceViaDriver } from '../../lib/core/database/workspaceSearch.js';
import type { WorkspaceSearchResult } from '../../lib/core/database/workspaceSearchResults.js';

import { openDatabaseConnection } from './connection.js';
import { searchExternalDocuments } from './externalSearchCache.js';
import { getEffectiveSearchAliases } from './searchAliasMirror.js';
import { searchRemovedSources } from './storedRemovedSourceSearch.js';

export function searchWorkspace(query: string) {
  const { groups } = getEffectiveSearchAliases();
  const results: WorkspaceSearchResult[] = [...searchWorkspaceViaDriver(openDatabaseConnection().driver, query, groups), ...searchExternalDocuments(query, groups), ...searchRemovedSources(query, groups)];
  return results.sort((left, right) => Number(Boolean(left.isTrashed)) - Number(Boolean(right.isTrashed))
    || Number(Boolean(right.matchedOriginal)) - Number(Boolean(left.matchedOriginal)));
}

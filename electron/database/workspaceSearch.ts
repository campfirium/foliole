import { searchWorkspace as searchWorkspaceViaDriver } from '../../lib/core/database/workspaceSearch.js';

import { openDatabaseConnection } from './connection.js';
import { searchExternalDocuments } from './externalSearchCache.js';
import { getEffectiveSearchAliases } from './searchAliasMirror.js';

export function searchWorkspace(query: string) {
  const { groups } = getEffectiveSearchAliases();
  const results = [...searchWorkspaceViaDriver(openDatabaseConnection().driver, query, groups), ...searchExternalDocuments(query, groups)];
  return results.sort((left, right) => Number(Boolean(right.matchedOriginal)) - Number(Boolean(left.matchedOriginal)));
}

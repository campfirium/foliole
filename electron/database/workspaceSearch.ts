import { searchWorkspace as searchWorkspaceViaDriver } from '../../lib/core/database/workspaceSearch.js';

import { openDatabaseConnection } from './connection.js';
import { searchExternalDocuments } from './externalSearchCache.js';

export function searchWorkspace(query: string) {
  return [...searchWorkspaceViaDriver(openDatabaseConnection().driver, query), ...searchExternalDocuments(query)];
}

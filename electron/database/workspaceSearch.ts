import { searchWorkspace as searchWorkspaceViaDriver } from '../../lib/core/database/workspaceSearch.js';

import { openDatabaseConnection } from './connection.js';

export function searchWorkspace(query: string) {
  return searchWorkspaceViaDriver(openDatabaseConnection().driver, query);
}

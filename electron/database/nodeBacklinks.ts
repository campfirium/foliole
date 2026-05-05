import { loadNodeBacklinks as loadNodeBacklinksViaDriver } from '../../lib/core/database/nodeBacklinks.js';

import { openDatabaseConnection } from './connection.js';

export function loadNodeBacklinks(nodeId: string) {
  return loadNodeBacklinksViaDriver(openDatabaseConnection().driver, nodeId);
}

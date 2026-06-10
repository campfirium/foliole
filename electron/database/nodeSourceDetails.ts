import { loadNodeSourceDetails as loadNodeSourceDetailsViaDriver } from '../../lib/core/database/nodeSourceDetails.js';

import { openDatabaseConnection } from './connection.js';

export function loadNodeSourceDetails(nodeId: string, runLimit?: number) {
  return loadNodeSourceDetailsViaDriver(openDatabaseConnection().driver, nodeId, runLimit);
}

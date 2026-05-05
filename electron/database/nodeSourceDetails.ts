import { loadNodeSourceDetails as loadNodeSourceDetailsViaDriver, type NodeSourceDetails } from '../../lib/core/database/nodeSourceDetails.js';

import { openDatabaseConnection } from './connection.js';

export type { NodeSourceDetails };

export function loadNodeSourceDetails(nodeId: string, runLimit?: number) {
  return loadNodeSourceDetailsViaDriver(openDatabaseConnection().driver, nodeId, runLimit);
}

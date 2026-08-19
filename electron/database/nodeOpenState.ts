import { writeNodeOpenStateWithSync } from '../../lib/core/database/nodeOpenState.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function saveNodeOpenState(input: { lastOpenedAt: string; nodeId: string }) {
  const connection = openDatabaseConnection();
  const hostName = loadOrCreateDesktopHostName(input.lastOpenedAt);
  const result = writeNodeOpenStateWithSync(connection.driver, { ...input, hostName });
  if (!result) throw new Error('invalid_node_open_state');
  return result;
}

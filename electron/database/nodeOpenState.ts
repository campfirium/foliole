import { writeNodeOpenStateWithSync } from '../../lib/core/database/nodeOpenState.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

export function saveNodeOpenState(input: { lastOpenedAt: string; nodeId: string }) {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(input.lastOpenedAt);
  const result = writeNodeOpenStateWithSync(connection.driver, { ...input, deviceId });
  if (!result) throw new Error('invalid_node_open_state');
  return result;
}

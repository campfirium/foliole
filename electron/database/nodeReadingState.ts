import { saveNodeReadingStateWithSync } from '../../lib/core/database/nodeReadingSyncState.js';
import type { NativeSaveNodeReadingStateArgs } from '../../lib/platform/nativeNodeReadingStateContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function saveNodeReadingState(input: NativeSaveNodeReadingStateArgs) {
  saveNodeReadingStateWithSync(openDatabaseConnection().driver, {
    ...input,
    deviceId: loadOrCreateDesktopDeviceId(input.updatedAt),
    hostName: loadOrCreateDesktopHostName(input.updatedAt)
  });
  return null;
}

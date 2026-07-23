import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import type { NativeSaveNodeReviewStateArgs } from '../../lib/platform/nativeNodeReviewStateContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

export function saveNodeReviewState(input: NativeSaveNodeReviewStateArgs) {
  saveNodeReviewStateWithSync(openDatabaseConnection().driver, {
    ...input,
    deviceId: loadOrCreateDesktopDeviceId(input.updatedAt)
  });
  return null;
}

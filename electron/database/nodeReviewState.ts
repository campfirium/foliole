import { saveNodeReviewStateWithSync } from '../../lib/core/database/nodeReviewSyncState.js';
import type { NativeSaveNodeReviewStateArgs } from '../../lib/platform/nativeNodeReviewStateContract.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function saveNodeReviewState(input: NativeSaveNodeReviewStateArgs) {
  saveNodeReviewStateWithSync(openDatabaseConnection().driver, {
    ...input,
    hostName: loadOrCreateDesktopHostName(input.updatedAt)
  });
  return null;
}

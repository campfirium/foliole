import { readRequestSyncInventorySnapshot } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';

import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound.js';
import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';

/** Preserve the existing attachment stage until its separate replacement closure. */
export async function continueCompanionRequestSyncResources(input: NativeCompanionFramedSyncInventoryRequest) {
  const host = await currentCompanionRequestSyncDatabaseHost();
  const inventory = await host.readSnapshot(readRequestSyncInventorySnapshot);
  return runCompanionFramedSyncResourceRound(input, crypto.getRandomValues(new Uint8Array(16)), inventory.filter(entry => entry.objectType === 'node').map(entry => entry.globalId));
}

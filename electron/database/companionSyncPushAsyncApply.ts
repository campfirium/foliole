import { advanceInboundNodePeerBases } from '../../lib/core/sync/nodeVersionInboundPeerBase.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from './companionSyncPushTypes.js';
import { applyCompanionStateSyncPushWithDbPort } from './companionSyncPushWithDbPort.js';
import { openDatabaseConnection } from './connection.js';

export type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';

export async function applyCompanionSyncPushAsync(
  items: CompanionSyncPushPayload[],
  authenticatedDeviceId: string
): Promise<CompanionSyncPushResult> {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-push-batch' });
  return port.transaction(async tx => {
    const result = await applyCompanionStateSyncPushWithDbPort(tx, items);
    const heads = result.acks.filter(ack => ack.identity.objectType === 'node' &&
      (ack.status === 'accepted' || ack.status === 'already_applied') &&
      typeof ack.versionId === 'string' && !ack.canonicalObjectId)
      .map(ack => ({ objectId: ack.identity.objectId, versionId: ack.versionId! }));
    await advanceInboundNodePeerBases(tx, authenticatedDeviceId, heads);
    return result;
  });
}

export { applyCompanionStateSyncPushWithDbPort } from './companionSyncPushWithDbPort.js';

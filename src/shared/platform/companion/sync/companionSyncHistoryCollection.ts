import { recordCompletedSyncGroupRound } from '../../../../../lib/core/sync/syncGroupCoverageStore.js';
import { collectSyncGroupHistory } from '../../../../../lib/core/sync/syncHistoryCollection.js';

import { currentCompanionRequestSyncDatabaseHost } from './framed/companionRequestSyncDatabaseHost.js';

/** A lost coverage record only delays the group line; it never fails the round it describes. */
export async function recordCompanionCompletedSyncRound(input: {
  groupId: string; localDeviceId: string; peerDeviceId: string; startedAt: string;
}) {
  try {
    const host = await currentCompanionRequestSyncDatabaseHost();
    await host.write(db => db.transaction(tx => recordCompletedSyncGroupRound(tx, input)));
  } catch (error) {
    console.error('[request-sync] coverage record failed', error instanceof Error ? error.message : String(error));
  }
}

/** Reclaiming history never fails the round that made it reclaimable; the next round retries. */
export async function collectCompanionSyncHistory(groupId: string) {
  try {
    const host = await currentCompanionRequestSyncDatabaseHost();
    await collectSyncGroupHistory(write => host.write(write), groupId);
  } catch (error) {
    console.error('[request-sync] history collection failed', error instanceof Error ? error.message : String(error));
  }
}

import { recordCompletedSyncGroupRound } from '../../lib/core/sync/syncGroupCoverageStore.js';
import { collectSyncGroupHistory } from '../../lib/core/sync/syncHistoryCollection.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { createDesktopRequestSyncDatabaseHost } from './desktopRequestSyncDatabaseHost.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

async function currentHost() {
  return createDesktopRequestSyncDatabaseHost(await runWithDatabaseConnectionOwner(() => openDatabaseConnection().dbPath));
}

/** A lost coverage record only delays the group line; it never fails the round it describes. */
export async function recordDesktopCompletedSyncRound(peer: DesktopSyncGroupPeer, startedAt: string) {
  try {
    const host = await currentHost();
    await host.write(db => db.transaction(tx => recordCompletedSyncGroupRound(tx, { groupId: peer.group_id,
      localDeviceId: peer.local_device_id, peerDeviceId: peer.peer_device_id, startedAt })));
  } catch (error) {
    appendMainProcessDiagnosticLog('sync_group_coverage_record_failed', { error });
  }
}

/** Reclaiming history never fails the round that made it reclaimable; the next round retries. */
export async function collectDesktopSyncHistory(groupId: string) {
  try {
    const host = await currentHost();
    const collected = await collectSyncGroupHistory(write => host.write(write), groupId);
    if (collected.versions || collected.tombstones) appendMainProcessDiagnosticLog('sync_history_collected', collected);
  } catch (error) {
    appendMainProcessDiagnosticLog('sync_history_collection_failed', { error });
  }
}

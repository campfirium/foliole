import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from './framedSyncDatabaseDifference.js';
import { readFramedSyncOverwriteInventory } from './framedSyncInventoryRead.js';
import { pendingFramedSyncOverwriteDifferences } from './framedSyncOverwriteCompletion.js';
import { publishLocalNodePosition } from './nodeVersionMemberPositionPublish.js';
import { requestSyncPositionReady } from './requestSyncBodyRetention.js';
import { deliverRequestSyncDatabaseDifferences, type RequestSyncDatabaseRoundPort } from './requestSyncDatabaseRound.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { finishSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from './syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound, finishSyncGroupOverwriteProgress,
  type SyncGroupOverwriteProgress } from './syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, markSyncGroupRestoreApplied } from './syncGroupRestoreEvents.js';

/** A prepared business recovery accepts only its fixed source and never sends local differences. */
export async function runRequestSyncOverwriteRound(host: RequestSyncDatabaseHost,
  progress: SyncGroupOverwriteProgress, port: RequestSyncDatabaseRoundPort, signal?: AbortSignal) {
  const context = { groupId: progress.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch,
    receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch } as const;
  await host.readSnapshot(async db => {
    if (!await assertSyncGroupOverwriteInbound(db, context)) throw new Error('sync_group_overwrite_missing');
  }, signal);
  const inventories = await port.exchangeInventory();
  const differences = compareFramedSyncDatabaseInventories(inventories)
    .filter(difference => difference.direction === 'remote_to_local');
  // Recovery dependencies are also restricted to the chosen source.
  const round = await deliverRequestSyncDatabaseDifferences(port,
    { local: [], remote: inventories.remote }, differences, signal);
  const confirmed = await port.exchangeInventory();
  const transferred = round.delivered.length;
  const pending = pendingFramedSyncOverwriteDifferences({ ...confirmed, deliveredDifferences: round.delivered }).length;
  if (pending || round.deferred.length) return { complete: false, pending: Math.max(pending, round.deferred.length), transferred };
  const complete = await host.write(db => db.transaction(async tx => {
    signal?.throwIfAborted();
    const local = await readFramedSyncOverwriteInventory(tx, context);
    if (pendingFramedSyncOverwriteDifferences({ local, remote: confirmed.remote,
      deliveredDifferences: round.delivered }).length) return false;
    const adoption = await loadSyncGroupLocalAdoption(tx);
    await finishSyncGroupOverwriteProgress(tx, progress);
    if (adoption) await finishSyncGroupLocalAdoption(tx, adoption);
    else {
      const restore = await loadLatestSyncGroupRestoreEvent(tx, progress.groupId);
      if (!restore || restore.event.restore_id !== progress.overwriteId) throw new Error('framed_sync_restore_state_invalid');
      await markSyncGroupRestoreApplied(tx, restore.event);
    }
    for (const entry of local) {
      if (entry.objectType === 'node') await publishLocalNodePosition(tx, entry.globalId, requestSyncPositionReady);
    }
    signal?.throwIfAborted();
    return true;
  }));
  return { complete, pending: complete ? 0 : 1, transferred };
}

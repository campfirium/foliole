import { FRAMED_SYNC_PROTOCOL_VERSION, type FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';
import type { FramedSyncInventoryDifference } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncOverwriteInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { deliverFramedSyncDifferencesInDependencyOrder, framedSyncOrderBodyDependencies } from '../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { pendingFramedSyncOverwriteDifferences } from '../../lib/core/sync/framedSyncOverwriteCompletion.js';
import { finishSyncGroupLocalAdoption, type SyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, markSyncGroupRestoreApplied } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { withDesktopForegroundTimeMaintenance } from '../database/foregroundTimeMaintenance.js';
import { clearReadwiseDeviceConnection } from '../database/readwiseDeviceConnection.js';

import { createDesktopFramedSyncInboundBatchDelivery } from './desktopFramedSyncInboundBatchRound.js';
import type { InboundRound } from './desktopFramedSyncInboundRound.js';
import { exchangeDesktopFramedSyncInventoryHttp } from './desktopFramedSyncInventoryHttp.js';
import { runDesktopFramedSyncResourceRound } from './desktopFramedSyncResourceRound.js';
import { preserveDesktopIdentityRestore } from './preserveDesktopGroupRestore.js';
import { notifyWorkspaceSyncApplied } from './workspaceSyncAppliedEvents.js';

type Inventory = Awaited<ReturnType<typeof exchangeDesktopFramedSyncInventoryHttp>>;
type RestoreRound = {
  exchange: Parameters<typeof exchangeDesktopFramedSyncInventoryHttp>[0];
  inbound: InboundRound; inventories: Inventory; restoreId?: string; adoption?: SyncGroupLocalAdoption;
};

/** An explicit overwrite clears once, then uses the ordinary per-unit receive and receipt path. */
export async function runVerifiedDesktopFramedSyncRestoreRound(input: RestoreRound) {
  return withDesktopForegroundTimeMaintenance(() => restoreRound(input),
    async () => !(await loadSyncGroupOverwriteProgress(input.inbound.db)));
}

async function restoreRound(input: RestoreRound) {
  const { db } = input.inbound;
  const overwriteId = input.adoption?.libraryEpoch ?? input.restoreId;
  if (!overwriteId) throw new Error('sync_group_overwrite_missing');
  const current = await loadSyncGroupOverwriteProgress(db);
  if (current?.groupId === input.inbound.context.groupId && current.overwriteId === overwriteId &&
      current.receiverLibraryEpoch !== input.inbound.context.initiatorLibraryEpoch) {
    throw new Error('sync_group_overwrite_source_changed');
  }
  const context = { ...input.inbound.context, initiatorLibraryEpoch: overwriteId };
  input = { ...input, inbound: { ...input.inbound, context }, exchange: { ...input.exchange, context } };
  const progress = { groupId: context.groupId, overwriteId,
    providerDeviceId: context.responderDeviceId, providerLibraryEpoch: context.responderLibraryEpoch,
    receiverDeviceId: context.initiatorDeviceId, receiverLibraryEpoch: context.initiatorLibraryEpoch };
  if (input.restoreId && (current?.groupId !== progress.groupId || current.overwriteId !== overwriteId)) {
    await preserveDesktopIdentityRestore(context.groupId, input.restoreId);
  }
  const reset = await prepareSyncGroupOverwrite(db, progress);
  clearReadwiseDeviceConnection();
  if (reset.cleared) notifyWorkspaceSyncApplied({ appliedNodeIds: reset.removedNodeIds,
    appliedObjectIds: [], appliedReviewOpIds: [] });
  const { confirmed, deliveredDifferences, pending, deferred, transferred } = await receiveRestoreDifferences(input);
  if (pending || deferred.length) return { complete: false, pending: Math.max(pending, deferred.length), transferred };
  const complete = await db.transaction(async (tx) => {
    const currentInventory = await readFramedSyncOverwriteInventory(tx, inboundContext(input));
    if (pendingFramedSyncOverwriteDifferences({ local: currentInventory, remote: confirmed.remote,
      deliveredDifferences }).length) return false;
    await finishSyncGroupOverwriteProgress(tx, progress);
    if (input.adoption) await finishSyncGroupLocalAdoption(tx, input.adoption);
    else {
      const restore = await loadLatestSyncGroupRestoreEvent(tx, context.groupId);
      if (!restore || restore.event.restore_id !== overwriteId) throw new Error('framed_sync_restore_state_invalid');
      await markSyncGroupRestoreApplied(tx, restore.event);
    }
    return true;
  });
  const resources = complete ? await runDesktopFramedSyncResourceRound(
    { ...input.inbound, roundId: confirmed.roundId },
    confirmed.local.filter((entry) => entry.objectType === 'node').map((entry) => entry.globalId)) : undefined;
  return { complete, pending: complete ? 0 : 1, transferred, resources };
}

async function receiveRestoreDifferences(input: RestoreRound) {
  const inventories = await exchangePartialInventory(input);
  let transferred = 0;
  const deliveredDifferences: FramedSyncInventoryDifference[] = [];
  const differences = compareFramedSyncDatabaseInventories(inventories)
    .filter((difference) => difference.direction === 'remote_to_local');
  const deliver = createDesktopFramedSyncInboundBatchDelivery(differences,
    { ...input.inbound, roundId: inventories.roundId });
  const deferred = await deliverFramedSyncDifferencesInDependencyOrder(differences, async (difference) => {
    const result = await deliver(difference);
    if (result.sent) transferred += 1;
    if (result.state === 'delivered') deliveredDifferences.push(difference);
    return result.state;
  }, framedSyncOrderBodyDependencies(inventories));
  const confirmed = await exchangePartialInventory(input);
  const pending = pendingFramedSyncOverwriteDifferences({ ...confirmed, deliveredDifferences }).length;
  return { confirmed, deliveredDifferences, pending, deferred, transferred };
}

async function exchangePartialInventory(input: RestoreRound) {
  const localInventory = await readFramedSyncOverwriteInventory(input.inbound.db,
    inboundContext(input));
  return exchangeDesktopFramedSyncInventoryHttp({ ...input.exchange, localInventory });
}

function inboundContext(input: RestoreRound): FramedSyncContext {
  const context = input.inbound.context;
  return { groupId: context.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: context.responderDeviceId, senderLibraryEpoch: context.responderLibraryEpoch,
    receiverDeviceId: context.initiatorDeviceId, receiverLibraryEpoch: context.initiatorLibraryEpoch };
}

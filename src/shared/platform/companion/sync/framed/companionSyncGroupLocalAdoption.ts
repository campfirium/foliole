import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import { readFramedSyncOverwriteInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { framedSyncOrderBodyDependencies } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { pendingFramedSyncOverwriteDifferences } from '../../../../../../lib/core/sync/framedSyncOverwriteCompletion.js';
import { finishSyncGroupLocalAdoption, type SyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite,
  type SyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionSyncGroup } from '../syncGroupStore.js';

import { pullInventoryDifferences,
  readCompanionRemoteFramedSyncInventory } from './companionFramedSyncInventoryRound.js';
import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound.js';

function localInventory(db: DbPort, progress: SyncGroupOverwriteProgress) {
  return readFramedSyncOverwriteInventory(db, { groupId: progress.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch,
    receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch });
}

export async function adoptCompanionSyncGroupData(
  args: NativeCompanionFramedSyncInventoryRequest, adoption: SyncGroupLocalAdoption
) {
  if (args.sync_group_id !== adoption.groupId || args.receiver_device_id !== adoption.providerDeviceId) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
  const group = await loadCompanionSyncGroup();
  if (!group || group.group_id !== adoption.groupId) throw new Error('sync_group_local_adoption_source_mismatch');
  const progress: SyncGroupOverwriteProgress = { groupId: adoption.groupId, overwriteId: adoption.libraryEpoch,
    providerDeviceId: adoption.providerDeviceId, providerLibraryEpoch: args.receiver_library_epoch,
    receiverDeviceId: group.local_device_identity_key, receiverLibraryEpoch: adoption.libraryEpoch };
  const owner = getIosCompanionDatabaseOwner();
  await runCompanionSyncWriterTask(() => owner.runWriter((db) => prepareSyncGroupOverwrite(db, progress)));
  const [local, inventory] = await Promise.all([
    owner.read((db) => localInventory(db, progress)), readCompanionRemoteFramedSyncInventory(args)
  ]);
  const remote = inventory.entries;
  const differences = compareFramedSyncDatabaseInventories({ local, remote })
    .filter((difference) => difference.direction === 'remote_to_local');
  const dependencies = framedSyncOrderBodyDependencies({ local, remote })
    .filter((difference) => difference.direction === 'remote_to_local');
  const pulled = await pullInventoryDifferences(args, differences, inventory.roundId, dependencies);
  const confirmed = await readCompanionRemoteFramedSyncInventory(args);
  const confirmedRemote = confirmed.entries;
  const pending = await runCompanionSyncWriterTask(() => owner.runWriter((db) => db.transaction(async (tx) => {
    const current = await localInventory(tx, progress);
    const remaining = pendingFramedSyncOverwriteDifferences({ local: current, remote: confirmedRemote,
      deliveredDifferences: pulled.deliveredDifferences });
    if (remaining.length || pulled.deferredObjects.length) return remaining;
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finishSyncGroupLocalAdoption(tx, adoption);
    return [];
  })));
  const resources = await runCompanionFramedSyncResourceRound(args, confirmed.roundId,
    confirmedRemote.filter(entry => entry.objectType === 'node').map(entry => entry.globalId));
  const deferred = new Map([...pulled.deferredObjects, ...pending]
    .map(({ globalId, objectType }) => [`${objectType}\0${globalId}`, { globalId, objectType }]));
  return { received: pulled.received, deferredObjects: [...deferred.values()], sent: [], resources };
}

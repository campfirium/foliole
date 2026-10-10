import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import { readFramedSyncOverwriteInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { framedSyncOrderBodyDependencies } from '../../../../../../lib/core/sync/framedSyncInventoryRoundDelivery.js';
import { pendingFramedSyncOverwriteDifferences } from '../../../../../../lib/core/sync/framedSyncOverwriteCompletion.js';
import { finishSyncGroupOverwriteProgress, prepareSyncGroupOverwrite, loadSyncGroupOverwriteProgress,
  type SyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { withCompanionForegroundTimeMaintenance } from '../../runtime/companionForegroundTime.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { pullInventoryDifferences, readCompanionRemoteFramedSyncInventory } from './companionFramedSyncInventoryRound.js';
import { runCompanionFramedSyncResourceRound } from './companionFramedSyncResourceRound.js';

function localInventory(db: DbPort, progress: SyncGroupOverwriteProgress) {
  return readFramedSyncOverwriteInventory(db, { groupId: progress.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    senderDeviceId: progress.providerDeviceId, senderLibraryEpoch: progress.providerLibraryEpoch,
    receiverDeviceId: progress.receiverDeviceId, receiverLibraryEpoch: progress.receiverLibraryEpoch });
}

/** Adoption and restore share the clear-once, durable per-unit receive path. */
export async function receiveCompanionFramedSyncOverwrite(args: NativeCompanionFramedSyncInventoryRequest,
  progress: SyncGroupOverwriteProgress, finish: (db: DbPort) => Promise<void>) {
  return withCompanionForegroundTimeMaintenance(() => receiveOverwrite(args, progress, finish),
    () => getIosCompanionDatabaseOwner().read(async (db) => !(await loadSyncGroupOverwriteProgress(db))));
}

async function receiveOverwrite(args: NativeCompanionFramedSyncInventoryRequest,
  progress: SyncGroupOverwriteProgress, finish: (db: DbPort) => Promise<void>) {
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
  const pending = await runCompanionSyncWriterTask(() => owner.runWriter((db) => db.transaction(async (tx) => {
    const current = await localInventory(tx, progress);
    const remaining = pendingFramedSyncOverwriteDifferences({ local: current, remote: confirmed.entries,
      deliveredDifferences: pulled.deliveredDifferences });
    if (remaining.length || pulled.deferredObjects.length) return remaining;
    await finishSyncGroupOverwriteProgress(tx, progress);
    await finish(tx);
    return [];
  })));
  const resources = await runCompanionFramedSyncResourceRound(args, confirmed.roundId,
    confirmed.entries.filter(entry => entry.objectType === 'node').map(entry => entry.globalId));
  const deferred = new Map([...pulled.deferredObjects, ...pending]
    .map(({ globalId, objectType }) => [`${objectType}\0${globalId}`, { globalId, objectType }]));
  return { received: pulled.received, deferredObjects: [...deferred.values()], sent: [], resources };
}

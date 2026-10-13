import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { transfer, type RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

export async function sendCurrentObject(source: RestorePeer, target: RestorePeer, objectType = 'node', globalId = 'topic') {
  const difference = compareFramedSyncInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] })
    .find(value => value.objectType === objectType && value.globalId === globalId);
  if (!difference) throw new Error('current_learning_object_missing');
  await transfer(source, target, { groupId: 'group', overwriteId: 'unused', providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: target.epoch }, difference, false);
}

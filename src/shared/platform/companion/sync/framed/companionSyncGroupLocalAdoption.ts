import { finishSyncGroupLocalAdoption, type SyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import type { SyncGroupOverwriteProgress } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import { loadLatestSyncGroupRestoreEvent, markSyncGroupRestoreApplied } from '../../../../../../lib/core/sync/syncGroupRestoreEvents.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionSyncGroup } from '../syncGroupStore.js';

import { receiveCompanionFramedSyncOverwrite } from './companionFramedSyncOverwriteRound.js';

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
  return receiveCompanionFramedSyncOverwrite(args, progress, (db) => finishSyncGroupLocalAdoption(db, adoption));
}

export async function restoreCompanionSyncGroupData(args: NativeCompanionFramedSyncInventoryRequest, restoreId: string) {
  const owner = getIosCompanionDatabaseOwner();
  const restore = await owner.read((db) => loadLatestSyncGroupRestoreEvent(db, args.sync_group_id));
  if (!restore || restore.event.restore_id !== restoreId ||
      restore.event.source_device_identity_key !== args.receiver_device_id) throw new Error('framed_sync_restore_state_invalid');
  if (restore.applied) return null;
  const group = await loadCompanionSyncGroup();
  if (!group || group.group_id !== args.sync_group_id) throw new Error('sync_group_not_joined');
  return receiveCompanionFramedSyncOverwrite(args, { groupId: group.group_id, overwriteId: restoreId,
    providerDeviceId: args.receiver_device_id, providerLibraryEpoch: args.receiver_library_epoch,
    receiverDeviceId: group.local_device_identity_key, receiverLibraryEpoch: restoreId },
  (db) => markSyncGroupRestoreApplied(db, restore.event));
}

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import { compareFramedSyncInventories } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { loadSyncGroupLocalAdoption, type SyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import type { NativeCompanionFramedSyncInventoryRequest, NativeCompanionFramedSyncStagedTransfer } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { loadCompanionSyncGroup } from '../syncGroupStore.js';

import { prepareCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { applyPreparedCompanionFramedSyncTransfers } from './companionFramedSyncApplyPrepared.js';
import { readCompanionRemoteFramedSyncInventory } from './companionFramedSyncInventoryRound.js';

export async function adoptCompanionSyncGroupData(
  args: NativeCompanionFramedSyncInventoryRequest, adoption: SyncGroupLocalAdoption
) {
  if (args.sync_group_id !== adoption.groupId || args.receiver_device_id !== adoption.providerDeviceId) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
  const group = await loadCompanionSyncGroup();
  if (!group || group.group_id !== adoption.groupId) throw new Error('sync_group_local_adoption_source_mismatch');
  const inventory = await readCompanionRemoteFramedSyncInventory(args);
  const differences = compareFramedSyncInventories({ local: [], remote: inventory.entries });
  const staged: NativeCompanionFramedSyncStagedTransfer[] = [];
  for (const difference of differences) {
    const transfer = await FolioleCompanionSync.pullFramedSyncObject({ ...args, stage_only: true,
      frontier_fact_ids: difference.sourceSnapshot.frontierFactIds,
      object_id: difference.globalId, object_type: difference.objectType,
      required_relation_ids: difference.sourceSnapshot.requiredRelationIds,
      resource_hashes: difference.sourceSnapshot.resourceHashes.map(bytesToHex),
      review_fact_ids: difference.sourceSnapshot.reviewFactIds,
      state_fact_ids: difference.sourceSnapshot.stateFactIds ?? [], round_id: bytesToHex(inventory.roundId) });
    if (transfer.sender_device_id !== adoption.providerDeviceId ||
        transfer.sender_library_epoch !== args.receiver_library_epoch ||
        transfer.receiver_library_epoch !== adoption.libraryEpoch ||
        transfer.receiver_device_id !== group.local_device_identity_key) {
      throw new Error('sync_group_local_adoption_transfer_mismatch');
    }
    staged.push(transfer);
  }
  const confirmed = await readCompanionRemoteFramedSyncInventory(args);
  if (compareFramedSyncInventories({ local: inventory.entries, remote: confirmed.entries }).length) {
    throw new Error('framed_sync_source_changed');
  }
  const owner = getIosCompanionDatabaseOwner();
  const receipts = await runCompanionSyncWriterTask(() => owner.runWriter(async (db) => {
    const current = await loadSyncGroupLocalAdoption(db);
    if (!current || current.libraryEpoch !== adoption.libraryEpoch) throw new Error('sync_group_local_adoption_changed');
    const prepared = [];
    for (const transfer of staged) prepared.push(await prepareCompanionFramedSyncTransfer(db, {
      stagingKind: transfer.staging_kind, stagingPath: transfer.staging_path,
      transferId: hexToBytes(transfer.transfer_id), senderDeviceId: transfer.sender_device_id,
      senderLibraryEpoch: transfer.sender_library_epoch, receiverDeviceId: transfer.receiver_device_id,
      receiverLibraryEpoch: transfer.receiver_library_epoch, resourceStorageKeys: transfer.resource_storage_keys
    }));
    return applyPreparedCompanionFramedSyncTransfers(db, prepared, adoption);
  }));
  for (const difference of differences) await FolioleCompanionSync.pullFramedSyncObject({
    ...args, frontier_fact_ids: difference.sourceSnapshot.frontierFactIds,
    object_id: difference.globalId, object_type: difference.objectType,
    required_relation_ids: difference.sourceSnapshot.requiredRelationIds,
    resource_hashes: difference.sourceSnapshot.resourceHashes.map(bytesToHex),
    review_fact_ids: difference.sourceSnapshot.reviewFactIds,
    state_fact_ids: difference.sourceSnapshot.stateFactIds ?? [], round_id: bytesToHex(inventory.roundId)
  });
  return adoptionResult(receipts, differences.map((difference) => difference.globalId));
}

function adoptionResult(
  receipts: Awaited<ReturnType<typeof applyPreparedCompanionFramedSyncTransfers>>, objectIds: readonly string[]
) {
  return {
    deferredObjects: [], sent: [], received: receipts.map((receipt, index) => ({
      objectId: objectIds[index]!,
      receipt: { transfer_id: bytesToHex(receipt.transferId), content_id: bytesToHex(receipt.contentId),
        applied_state_hash: bytesToHex(receipt.appliedStateHash), receiver_device_id: receipt.receiverDeviceId,
        receiver_library_epoch: receipt.receiverLibraryEpoch }
    }))
  };
}

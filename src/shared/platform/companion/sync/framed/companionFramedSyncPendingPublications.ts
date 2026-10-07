import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { retireFramedSyncCompletedPublication } from '../../../../../../lib/core/sync/framedSyncCompletedPublication.js';
import type { FramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventory.js';
import { createFramedSyncOutboundReceiptStaging } from '../../../../../../lib/core/sync/framedSyncOutboundReceiptStaging.js';
import { reconcileFramedSyncPublication } from '../../../../../../lib/core/sync/framedSyncPublicationReconciliation.js';
import { completeFramedSyncRecoveredPublication, selectFramedSyncRecoveryPublication } from '../../../../../../lib/core/sync/framedSyncPublicationRecoverySelection.js';
import { sendWithRequiredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyDelivery.js';
import { collectDeliveredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyRetention.js';
import { loadSyncGroupLocalAdoption, isSyncGroupPeerAdopting } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

import { readCompanionFramedSyncInventoryEntry } from './companionFramedSyncInventory.js';
import { decodeCompanionInventoryEntry } from './companionFramedSyncInventoryRound.js';
import { sendCompanionFramedSyncObject } from './companionFramedSyncTransfer.js';

export function readCompanionFramedSyncPendingPublications(
  db: DbPort, args: NativeCompanionFramedSyncInventoryRequest
) {
  return db.query<{ object_id: string; object_type: string; state: string; transfer_id: string }>(
    `SELECT lower(hex(p.transfer_id)) AS transfer_id, p.state,
       (SELECT global_id FROM framed_sync_outbound_fact_refs f
        WHERE f.transfer_id = p.transfer_id ORDER BY rowid LIMIT 1) AS object_id,
       (SELECT object_type FROM framed_sync_outbound_fact_refs f
        WHERE f.transfer_id = p.transfer_id ORDER BY rowid LIMIT 1) AS object_type
     FROM framed_sync_outbound_publications p
     JOIN framed_sync_outbound_holds h ON h.transfer_id = p.transfer_id
     JOIN sync_group_local_state local ON local.singleton_id = 1 AND local.state = 'active'
       AND local.group_id = p.group_id AND local.local_device_identity_key = p.sender_device_id
     JOIN node_version_local_proof_state proof ON proof.singleton_id = 1
       AND proof.library_epoch = p.sender_library_epoch
     WHERE p.group_id = ? AND p.receiver_device_id = ? AND p.receiver_library_epoch = ?
       AND h.member_id = p.receiver_device_id AND p.state IN ('published', 'receipt_committed')
     ORDER BY p.rowid`,
    [args.sync_group_id, args.receiver_device_id, args.receiver_library_epoch]);
}

/** Failed delivery is compared again before the native sender is invoked. */
export async function resumeCompanionFramedSyncPendingPublications(
  args: NativeCompanionFramedSyncInventoryRequest,
  remoteInventory?: readonly FramedSyncInventoryEntry[]
) {
  const owner = getIosCompanionDatabaseOwner();
  if (await owner.read(loadSyncGroupLocalAdoption) || await owner.read((db) =>
    isSyncGroupPeerAdopting(db, args.sync_group_id, args.receiver_device_id))) return 0;
  const pending = await owner.read((db) => readCompanionFramedSyncPendingPublications(db, args));
  if (!pending.length) return 0;
  const remote = remoteInventory ?? (await FolioleCompanionSync.readFramedSyncInventory(args))
    .entries.map(decodeCompanionInventoryEntry);
  for (const publication of pending) {
    if (publication.state === 'receipt_committed') {
      await runCompanionSyncWriterTask(() => owner.runWriter(async (db) => {
        const transferId = hexToBytes(publication.transfer_id);
        await createFramedSyncOutboundReceiptStaging(db).releaseOutboundHolds(transferId);
        await collectDeliveredParentOrderBodies(db, transferId);
        await retireFramedSyncCompletedPublication(db, transferId);
      }));
    } else {
      const state = await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
        reconcileFramedSyncPublication(db, hexToBytes(publication.transfer_id), remote)));
      if (state === 'satisfied') {
        await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
          collectDeliveredParentOrderBodies(db, hexToBytes(publication.transfer_id))));
        await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
          retireFramedSyncCompletedPublication(db, hexToBytes(publication.transfer_id))));
        continue;
      }
      const recovery = await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
        selectFramedSyncRecoveryPublication(db, hexToBytes(publication.transfer_id), remote)));
      const recoveryId = bytesToHex(recovery.transferId);
      const receipt = await sendWithRequiredParentOrderBodies(() => FolioleCompanionSync.sendFramedSyncTransfer({ ...args,
        include_current_node: false, object_id: publication.object_id, object_type: publication.object_type,
        required_relation_ids: [], review_fact_ids: [], state_fact_ids: [],
        transfer_id: recoveryId }), (versionId) => supplyOrderBody(args, versionId));
      if (receipt.transfer_id !== recoveryId ||
          receipt.receiver_device_id !== args.receiver_device_id ||
          receipt.receiver_library_epoch !== args.receiver_library_epoch) {
        throw new Error('framed_sync_transfer_receipt_invalid');
      }
      await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
        completeFramedSyncRecoveredPublication(db, hexToBytes(publication.transfer_id), recovery.transferId)));
      await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
        collectDeliveredParentOrderBodies(db, hexToBytes(publication.transfer_id))));
      await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
        retireFramedSyncCompletedPublication(db, hexToBytes(publication.transfer_id))));
    }
  }
  return pending.length;
}

async function supplyOrderBody(args: NativeCompanionFramedSyncInventoryRequest, versionId: string) {
  const entry = await getIosCompanionDatabaseOwner().read((db) => readCompanionFramedSyncInventoryEntry(db,
    { globalId: versionId, objectType: 'order_version' }));
  if (!entry) throw new Error(`sync_parent_order_body_unavailable:${versionId}`);
  await sendCompanionFramedSyncObject({ endpointUrl: args.endpoint_url, groupId: args.sync_group_id,
    includeCurrentNode: true, objectId: versionId, objectType: 'order_version',
    receiverDeviceId: args.receiver_device_id, receiverLibraryEpoch: args.receiver_library_epoch,
    requiredRelationIds: [], reviewFactIds: [], stateFactIds: entry.state_fact_ids });
}

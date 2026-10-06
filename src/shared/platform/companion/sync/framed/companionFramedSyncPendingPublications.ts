import { hexToBytes } from '@noble/hashes/utils.js';

import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { createFramedSyncOutboundReceiptStaging } from '../../../../../../lib/core/sync/framedSyncOutboundReceiptStaging.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { runCompanionSyncWriterTask } from '../../../companionSyncWriterQueue.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

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

/** Normal reconnect drains fixed deliveries before comparing the new inventory. */
export async function resumeCompanionFramedSyncPendingPublications(
  args: NativeCompanionFramedSyncInventoryRequest
) {
  const owner = getIosCompanionDatabaseOwner();
  const pending = await owner.read((db) => readCompanionFramedSyncPendingPublications(db, args));
  for (const publication of pending) {
    if (publication.state === 'receipt_committed') {
      await runCompanionSyncWriterTask(() => owner.runWriter((db) =>
        createFramedSyncOutboundReceiptStaging(db).releaseOutboundHolds(hexToBytes(publication.transfer_id))));
    } else {
      const receipt = await FolioleCompanionSync.sendFramedSyncTransfer({ ...args,
        include_current_node: false, object_id: publication.object_id, object_type: publication.object_type,
        required_relation_ids: [], review_fact_ids: [], state_fact_ids: [],
        transfer_id: publication.transfer_id });
      if (receipt.transfer_id !== publication.transfer_id ||
          receipt.receiver_device_id !== args.receiver_device_id ||
          receipt.receiver_library_epoch !== args.receiver_library_epoch) {
        throw new Error('framed_sync_transfer_receipt_invalid');
      }
    }
  }
  return pending.length;
}

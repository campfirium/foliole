import {
  failFramedSync,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncReceipt,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import type { TransferReceiptStage } from './framedSyncContract.js';

export function framedSyncReceiptMatches(left: TransferReceiptStage, right: TransferReceiptStage) {
  return sameFramedSyncBytes(left.transferId, right.transferId) &&
    sameFramedSyncBytes(left.contentId, right.contentId) &&
    sameFramedSyncBytes(left.appliedStateHash, right.appliedStateHash) &&
    left.receiverDeviceId === right.receiverDeviceId && left.receiverLibraryEpoch === right.receiverLibraryEpoch;
}

export function createFramedSyncOutboundReceiptStaging(db: DbPort) {
  return {
    async commitOutboundReceipt(value: TransferReceiptStage) {
      return db.transaction(async (tx) => {
        const owner = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [value.transferId]);
        if (!owner || !sameFramedSyncBytes(framedSyncBytes(owner, 'content_id'), value.contentId) ||
          framedSyncText(owner, 'receiver_device_id') !== value.receiverDeviceId ||
          framedSyncText(owner, 'receiver_library_epoch') !== value.receiverLibraryEpoch) {
          failFramedSync('outbound_receipt_mismatch');
        }
        const existing = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [value.transferId]);
        if (existing) return framedSyncReceiptMatches(readFramedSyncReceipt(existing), value)
          ? 'identical' as const : failFramedSync('receipt_identity_conflict');
        await tx.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [value.transferId,
          value.contentId, value.receiverDeviceId, value.receiverLibraryEpoch, value.appliedStateHash]);
        await tx.run(`UPDATE framed_sync_outbound_publications SET state = 'receipt_committed'
          WHERE transfer_id = ?`, [value.transferId]);
        return 'committed' as const;
      });
    },

    async releaseOutboundHolds(transferId: Uint8Array) {
      await db.transaction(async (tx) => {
        if (!await readFramedSyncRow(tx,
          'SELECT 1 AS present FROM framed_sync_receipts WHERE transfer_id = ?', [transferId])) {
          failFramedSync('receipt_required_for_hold_release');
        }
        await tx.run('DELETE FROM framed_sync_outbound_holds WHERE transfer_id = ?', [transferId]);
      });
    }
  };
}

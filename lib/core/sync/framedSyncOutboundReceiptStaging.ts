import {
  failFramedSync,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncReceipt,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../database/framedSyncStagingSerialization.js';

import type { DbPort } from './dbPort.js';
import { markFramedSyncCompletion } from './framedSyncCompletionRetention.js';
import type { TransferReceiptStage } from './framedSyncContract.js';
import { retireFramedSyncFrozenBodies } from './framedSyncFrozenBody.js';

export function framedSyncReceiptInputMatches(left: TransferReceiptStage, right: TransferReceiptStage) {
  return sameFramedSyncBytes(left.transferId, right.transferId) &&
    sameFramedSyncBytes(left.contentId, right.contentId) &&
    left.receiverDeviceId === right.receiverDeviceId && left.receiverLibraryEpoch === right.receiverLibraryEpoch;
}

export function framedSyncReceiptMatches(left: TransferReceiptStage, right: TransferReceiptStage) {
  return framedSyncReceiptInputMatches(left, right) &&
    sameFramedSyncBytes(left.appliedStateHash, right.appliedStateHash);
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
        await markFramedSyncCompletion(tx, value.transferId);
        const existing = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [value.transferId]);
        if (existing) {
          const prior = readFramedSyncReceipt(existing);
          if (!framedSyncReceiptInputMatches(prior, value)) {
            failFramedSync('receipt_identity_conflict');
          }
          await tx.run("UPDATE framed_sync_outbound_publications SET state = 'receipt_committed' WHERE transfer_id = ?",
            [value.transferId]);
          if (sameFramedSyncBytes(prior.appliedStateHash, value.appliedStateHash)) return 'identical' as const;
          await tx.run('UPDATE framed_sync_receipts SET applied_state_hash = ? WHERE transfer_id = ?',
            [value.appliedStateHash, value.transferId]);
          await tx.run("DELETE FROM framed_sync_outbound_attempts WHERE transfer_id = ? AND purpose = 'receipt'",
            [value.transferId]);
          return 'committed' as const;
        }
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
        await retireFramedSyncFrozenBodies(tx, transferId);
        await tx.run("DELETE FROM framed_sync_outbound_attempts WHERE transfer_id = ? AND purpose = 'transfer'", [transferId]);
        await tx.run('UPDATE framed_sync_outbound_publications SET canonical_manifest = ? WHERE transfer_id = ?',
          [new Uint8Array(), transferId]);
      });
    }
  };
}

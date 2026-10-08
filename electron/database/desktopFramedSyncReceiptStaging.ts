import {
  failFramedSync,
  framedSyncBytes,
  framedSyncText,
  readFramedSyncReceipt,
  readFramedSyncRow,
  sameFramedSyncBytes
} from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { markFramedSyncCompletion } from '../../lib/core/sync/framedSyncCompletionRetention.js';
import type {
  PreparedTransferAttempt,
  StoredEncryptedFrame,
  TransferReceiptStage
} from '../../lib/core/sync/framedSyncContract.js';
import { retireFramedSyncFrozenBodies } from '../../lib/core/sync/framedSyncFrozenBody.js';
import {
  createFramedSyncOutboundReceiptStaging,
  framedSyncReceiptMatches
} from '../../lib/core/sync/framedSyncOutboundReceiptStaging.js';
import type { ApplyCommitInput } from '../../lib/core/sync/framedSyncStagingContract.js';

import {
  commitFramedSyncFrame,
  finalizeFramedSyncAttempt,
  loadReplayableFramedSyncFrames,
  persistFramedSyncAttempt
} from './desktopFramedSyncAttemptStaging.js';

export interface DesktopFramedSyncTerminationPort {
  persistTerminationRequest(input: Readonly<{
    authorDeviceId: string;
    memberId: string;
    transferId: Uint8Array;
  }>): Promise<'created' | 'identical'>;
}

function createInboundReceiptStaging(db: DbPort) {
  return {
    async commitApplyAndReceipt(input: ApplyCommitInput) {
      return db.transaction(async (tx) => {
        const value = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_inbound_transfers WHERE transfer_id = ?', [input.transferId]);
        if (!value || framedSyncText(value, 'state') !== 'ready_to_apply' ||
          !sameFramedSyncBytes(framedSyncBytes(value, 'content_id'), input.contentId)) {
          failFramedSync('inbound_transfer_not_ready');
        }
        const receipt: TransferReceiptStage = { ...input };
        const existing = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [input.transferId]);
        if (existing && !framedSyncReceiptMatches(readFramedSyncReceipt(existing), receipt)) {
          failFramedSync('receipt_identity_conflict');
        }
        if (!existing) await tx.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [input.transferId,
          input.contentId, input.receiverDeviceId, input.receiverLibraryEpoch, input.appliedStateHash]);
        await markFramedSyncCompletion(tx, input.transferId);
        await tx.run(`UPDATE framed_sync_inbound_transfers SET state = 'applied' WHERE transfer_id = ?`,
          [input.transferId]);
        return receipt;
      });
    },

    async loadReceipt(transferId: Uint8Array) {
      const value = await readFramedSyncRow(db,
        'SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [transferId]);
      return value ? readFramedSyncReceipt(value) : null;
    }
  };
}

function createReceiptAttemptStaging(db: DbPort) {
  return {
    async persistReceiptAttempt(receipt: TransferReceiptStage, attempt: PreparedTransferAttempt) {
      const stored = await readFramedSyncRow(db,
        'SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [receipt.transferId]);
      if (!stored || !framedSyncReceiptMatches(readFramedSyncReceipt(stored), receipt)) {
        failFramedSync('receipt_not_committed');
      }
      return persistFramedSyncAttempt(db, receipt.transferId, 'receipt', attempt);
    },

    commitReceiptFrame(transferId: Uint8Array, attemptId: Uint8Array, frame: StoredEncryptedFrame) {
      return commitFramedSyncFrame(db, transferId, 'receipt', attemptId, frame);
    },

    async finalizeReceiptAttempt(transferId: Uint8Array, attemptId: Uint8Array) {
      await finalizeFramedSyncAttempt(db, transferId, 'receipt', attemptId);
    },

    loadReplayableReceiptFrames(transferId: Uint8Array, attemptId: Uint8Array) {
      return loadReplayableFramedSyncFrames(db, transferId, 'receipt', attemptId);
    },

    async persistTerminationRequest(input: {
      authorDeviceId: string;
      memberId: string;
      transferId: Uint8Array;
    }) {
      return db.transaction(async (tx) => {
        const publication = await readFramedSyncRow(tx,
          'SELECT * FROM framed_sync_outbound_publications WHERE transfer_id = ?', [input.transferId]);
        if (!publication || framedSyncText(publication, 'sender_device_id') !== input.authorDeviceId ||
          framedSyncText(publication, 'receiver_device_id') !== input.memberId) {
          failFramedSync('termination_request_identity_mismatch');
        }
        const existing = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_termination_requests
          WHERE transfer_id = ? AND member_id = ?`, [input.transferId, input.memberId]);
        if (existing) return framedSyncText(existing, 'author_device_id') === input.authorDeviceId
          ? 'identical' as const : failFramedSync('termination_request_identity_conflict');
        await tx.run(`INSERT INTO framed_sync_termination_requests VALUES (?, ?, ?, 'requested')`,
          [input.transferId, input.memberId, input.authorDeviceId]);
        return 'created' as const;
      });
    },

    async acknowledgeTermination(transferId: Uint8Array, memberId: string) {
      await db.transaction(async (tx) => {
        const request = await readFramedSyncRow(tx, `SELECT * FROM framed_sync_termination_requests
          WHERE transfer_id = ? AND member_id = ?`, [transferId, memberId]);
        if (!request) failFramedSync('termination_request_required');
        await tx.run(`UPDATE framed_sync_termination_requests SET state = 'acknowledged'
          WHERE transfer_id = ? AND member_id = ?`, [transferId, memberId]);
        await tx.run('INSERT OR IGNORE INTO framed_sync_termination_acks VALUES (?, ?)', [transferId, memberId]);
        await tx.run(`UPDATE framed_sync_outbound_publications SET state = 'terminated'
          WHERE transfer_id = ? AND receiver_device_id = ?`, [transferId, memberId]);
        await tx.run('DELETE FROM framed_sync_outbound_holds WHERE transfer_id = ? AND member_id = ?',
          [transferId, memberId]);
        await tx.run('DELETE FROM framed_sync_blob_pins WHERE transfer_id = ?', [transferId]);
        await retireFramedSyncFrozenBodies(tx, transferId);
      });
    }
  };
}

export function createDesktopFramedSyncReceiptStaging(db: DbPort) {
  return {
    ...createFramedSyncOutboundReceiptStaging(db),
    ...createInboundReceiptStaging(db),
    ...createReceiptAttemptStaging(db)
  };
}

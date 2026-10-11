import { bytesToHex } from '@noble/hashes/utils.js';

import type { PreparedTransferAttempt, TransferReceiptStage } from './framedSyncContract.js';
import { createFramedSyncFileAttempts } from './framedSyncFileAttempts.js';
import { framedSyncInboundDirectory, readFramedSyncFileInbound, requireFramedSyncFileInbound,
  writeFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { loadFramedSyncFileTask } from './framedSyncFilePublication.js';
import { framedSyncReceiptMatches } from './framedSyncOutboundReceiptStaging.js';
import type { ApplyCommitInput } from './framedSyncStagingContract.js';

/** The caller has committed business facts; a missing file receipt leaves the verified input recoverable. */
async function recordApplied(files: FramedSyncFilePort, input: ApplyCommitInput) {
  return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, input.transferId);
    if (record.receipt) {
      if (!framedSyncReceiptMatches(record.receipt, input)) throw new Error('receipt_identity_conflict');
      return record.receipt;
    }
    if (record.state !== 'ready_to_apply' || bytesToHex(record.proposal.contentId) !== bytesToHex(input.contentId) ||
        record.proposal.context.receiverDeviceId !== input.receiverDeviceId ||
        record.proposal.context.receiverLibraryEpoch !== input.receiverLibraryEpoch || input.appliedStateHash.length !== 32) {
      throw new Error('inbound_transfer_not_ready');
    }
    await writeFramedSyncFileInbound(files, { ...record, receipt: input, state: 'applied', completedAt: Date.now() });
    return input;
  });
}

export function createFramedSyncFileReceiptStaging(files: FramedSyncFilePort) {
  const attempts = createFramedSyncFileAttempts(files, 'receipt');
  const loadReceipt = async (transferId: Uint8Array) => (await readFramedSyncFileInbound(files, transferId))?.receipt ??
    (await loadFramedSyncFileTask(files, transferId))?.receipt ?? null;
  return {
    commitApplyAndReceipt: (input: ApplyCommitInput) => recordApplied(files, input),
    loadReceipt,
    async persistReceiptAttempt(receipt: TransferReceiptStage, attempt: PreparedTransferAttempt) {
      const recorded = await loadReceipt(receipt.transferId);
      if (!recorded || !framedSyncReceiptMatches(recorded, receipt)) throw new Error('receipt_not_committed');
      return attempts.persist(receipt.transferId, attempt);
    },
    commitReceiptFrame: attempts.commit,
    async finalizeReceiptAttempt(transferId: Uint8Array, attemptId: Uint8Array) { await attempts.finalize(transferId, attemptId); },
    async loadReplayableReceiptFrames(transferId: Uint8Array, attemptId: Uint8Array) {
      const frames = [];
      for await (const frame of attempts.stream(transferId, attemptId)) frames.push(frame);
      return frames;
    }
  };
}

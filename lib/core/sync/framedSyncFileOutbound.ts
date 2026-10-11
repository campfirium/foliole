import { bytesToHex } from '@noble/hashes/utils.js';

import type { TransferReceiptStage } from './framedSyncContract.js';
import { createFramedSyncFileAttempts } from './framedSyncFileAttempts.js';
import { releaseFramedSyncFileBodies } from './framedSyncFileBodies.js';
import { encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedSyncPublicationDirectory, framedSyncPublicationKey, loadFramedSyncFilePublication,
  loadFramedSyncFileTask, publishFramedSyncFileOutbound } from './framedSyncFilePublication.js';
import { framedSyncReceiptInputMatches, framedSyncReceiptMatches } from './framedSyncOutboundReceiptStaging.js';

async function commitReceipt(files: FramedSyncFilePort, receipt: TransferReceiptStage) {
  return files.exclusive(framedSyncPublicationDirectory(receipt.transferId), async () => {
    const task = await loadFramedSyncFileTask(files, receipt.transferId);
    if (!task || bytesToHex(task.contentId) !== bytesToHex(receipt.contentId) ||
        task.context.receiverDeviceId !== receipt.receiverDeviceId ||
        task.context.receiverLibraryEpoch !== receipt.receiverLibraryEpoch) throw new Error('outbound_receipt_mismatch');
    if (task.receipt && !framedSyncReceiptInputMatches(task.receipt, receipt)) throw new Error('receipt_identity_conflict');
    if (task.receipt && framedSyncReceiptMatches(task.receipt, receipt)) return 'identical' as const;
    await files.write(framedSyncPublicationKey(receipt.transferId), encodeFramedSyncFileJson({ ...task, receipt,
      state: task.state === 'retired' ? 'retired' : 'confirmed', completedAt: Date.now() }));
    return 'committed' as const;
  });
}

export async function releaseFramedSyncFilePublication(files: FramedSyncFilePort, transferId: Uint8Array) {
  await files.exclusive(framedSyncPublicationDirectory(transferId), async () => {
    const task = await loadFramedSyncFileTask(files, transferId);
    if (!task || task.state === 'published') throw new Error('receipt_required_for_hold_release');
    const publication = await loadFramedSyncFilePublication(files, transferId);
    if (publication) await releaseFramedSyncFileBodies(files, publication.manifest.blobs, { purpose: 'outbound', transferId });
    const retired = { ...task };
    delete retired.manifest;
    delete retired.factDigests;
    await files.write(framedSyncPublicationKey(transferId), encodeFramedSyncFileJson({ ...retired, state: 'retired' }));
    await files.remove(`attempts/${bytesToHex(transferId)}/transfer`);
    await files.remove(`outbound/${bytesToHex(transferId)}/facts`);
  });
}

export function createFramedSyncFileOutboundStaging(files: FramedSyncFilePort) {
  const attempts = createFramedSyncFileAttempts(files, 'transfer');
  return {
    publishOutbound: (input: Parameters<typeof publishFramedSyncFileOutbound>[1]) => publishFramedSyncFileOutbound(files, input),
    loadOutboundPublication: (transferId: Uint8Array) => loadFramedSyncFilePublication(files, transferId),
    persistOutboundAttempt: attempts.persist,
    commitOutboundFrame: attempts.commit,
    finalizeOutboundAttempt: attempts.finalize,
    abandonOutboundAttempt: attempts.abandon,
    streamReplayableFrames: attempts.stream,
    async loadReplayableFrames(transferId: Uint8Array, attemptId: Uint8Array) {
      const frames = [];
      for await (const frame of attempts.stream(transferId, attemptId)) frames.push(frame);
      return frames;
    },
    commitOutboundReceipt: (receipt: TransferReceiptStage) => commitReceipt(files, receipt),
    releaseOutboundHolds: (transferId: Uint8Array) => releaseFramedSyncFilePublication(files, transferId),
    listReplayableAttempts: attempts.listReplayable
  };
}

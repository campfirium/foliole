import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { PublishedTransfer, TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { recordFramedSyncPeerEpoch } from '../../lib/core/sync/framedSyncPeerEpoch.js';
import { advanceLocalSourceRevision } from '../../lib/core/sync/nodeVersionInboundReceipt.js';
import { createDesktopFramedSyncStaging } from '../database/desktopFramedSyncStaging.js';

export type DesktopFramedInboundIdentity = Pick<PublishedTransfer, 'context' | 'manifestHash' | 'transferId'> & {
  globalId: string;
  objectType: string;
};

export async function recordDesktopFramedSourceProgress(tx: DbPort, transfers: readonly DesktopFramedInboundIdentity[]) {
  const senders = new Set<string>();
  for (const transfer of transfers) {
    if (!senders.has(transfer.context.senderDeviceId)) {
      await advanceLocalSourceRevision(tx, transfer.context.senderDeviceId);
      senders.add(transfer.context.senderDeviceId);
    }
    await recordFramedSyncPeerEpoch(tx, {
      groupId: transfer.context.groupId,
      libraryEpoch: transfer.context.senderLibraryEpoch,
      peerDeviceId: transfer.context.senderDeviceId,
      transferId: transfer.transferId
    });
  }
}

export async function createDesktopFramedReceipt(tx: DbPort, transfer: DesktopFramedInboundIdentity): Promise<TransferReceiptStage> {
  const appliedStateHash = (await readFramedSyncInventoryEntry(tx, {
    globalId: transfer.globalId, objectType: transfer.objectType
  }))?.sharedStateHash;
  if (!appliedStateHash) throw new Error(`framed_sync_process_inventory_missing:${transfer.objectType}:${transfer.globalId}`);
  return createDesktopFramedSyncStaging(tx).commitApplyAndReceipt({
    appliedStateHash,
    contentId: transfer.manifestHash,
    receiverDeviceId: transfer.context.receiverDeviceId,
    receiverLibraryEpoch: transfer.context.receiverLibraryEpoch,
    transferId: transfer.transferId
  });
}

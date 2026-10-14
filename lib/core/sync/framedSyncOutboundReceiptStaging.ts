import { sameFramedSyncBytes } from '../database/framedSyncStagingSerialization.js';

import type { TransferReceiptStage } from './framedSyncContract.js';

export function framedSyncReceiptInputMatches(left: TransferReceiptStage, right: TransferReceiptStage) {
  return sameFramedSyncBytes(left.transferId, right.transferId) &&
    sameFramedSyncBytes(left.contentId, right.contentId) &&
    left.receiverDeviceId === right.receiverDeviceId && left.receiverLibraryEpoch === right.receiverLibraryEpoch;
}

export function framedSyncReceiptMatches(left: TransferReceiptStage, right: TransferReceiptStage) {
  return framedSyncReceiptInputMatches(left, right) &&
    sameFramedSyncBytes(left.appliedStateHash, right.appliedStateHash);
}

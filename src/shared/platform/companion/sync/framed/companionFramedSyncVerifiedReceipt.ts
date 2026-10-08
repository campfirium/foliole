import { readFramedSyncReceipt, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { markFramedSyncCompletion } from '../../../../../../lib/core/sync/framedSyncCompletionRetention.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import type { loadVerifiedCompanionReady } from './companionFramedSyncVerifiedReady.js';

type Ready = Awaited<ReturnType<typeof loadVerifiedCompanionReady>>;

export async function existingVerifiedCompanionReceipt(db: DbPort, input: CompanionFramedSyncApplyInput,
  ready: Ready): Promise<TransferReceiptStage | null> {
  const [row] = await db.query<DbRow>('SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [input.transferId]);
  if (!row) return null;
  const stored = readFramedSyncReceipt(row);
  if (!sameFramedSyncBytes(stored.contentId, ready.contentId) || stored.receiverDeviceId !== input.receiverDeviceId ||
      stored.receiverLibraryEpoch !== input.receiverLibraryEpoch ||
      (ready.resourceUnit && !sameFramedSyncBytes(stored.appliedStateHash, ready.contentId))) throw new Error('receipt_identity_conflict');
  return stored;
}

export async function commitVerifiedCompanionReceipt(db: DbPort, input: CompanionFramedSyncApplyInput,
  ready: Ready): Promise<TransferReceiptStage> {
  const existing = await existingVerifiedCompanionReceipt(db, input, ready);
  if (existing) return existing;
  const current = ready.resourceUnit ? null : await readFramedSyncInventoryEntry(db,
    { globalId: ready.globalId, objectType: ready.objectType });
  if (!ready.resourceUnit && !current) throw new Error('framed_sync_applied_state_missing');
  const receipt = { contentId: ready.contentId, receiverDeviceId: input.receiverDeviceId,
    receiverLibraryEpoch: input.receiverLibraryEpoch, transferId: input.transferId,
    appliedStateHash: ready.resourceUnit ? ready.contentId : current!.sharedStateHash };
  await db.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [receipt.transferId,
    receipt.contentId, receipt.receiverDeviceId, receipt.receiverLibraryEpoch, receipt.appliedStateHash]);
  await markFramedSyncCompletion(db, receipt.transferId);
  return receipt;
}

import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { readFramedSyncReceipt, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { markFramedSyncCompletion } from '../../../../../../lib/core/sync/framedSyncCompletionRetention.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { withFramedExternalDocumentBody } from '../../../../../../lib/core/sync/framedSyncExternalDocumentBody.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { assertFramedSyncNodeParentDependencies } from '../../../../../../lib/core/sync/framedSyncNodeParentDependencies.js';
import { applyFramedSyncObjectStateRecord } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewApply.js';
import { replayRetiredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyReplay.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeConvergence.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import type { prepareCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';
import { assertCompanionFramedSyncInboundAllowed } from './companionFramedSyncInboundGate.js';

type Prepared = Awaited<ReturnType<typeof prepareCompanionFramedSyncTransfer>>;

export function applyPreparedCompanionFramedSyncTransfers(
  db: DbPort, transfers: readonly Prepared[]
) {
  if (transfers.some((transfer) => transfer.decoded.resourceFacts)) {
    throw new Error('framed_sync_resource_verified_apply_required');
  }
  return db.transaction(async (tx) => {
    await assertCompanionFramedSyncInboundAllowed(tx, transfers.map((transfer) => transfer.input));
    const pending = [];
    for (const transfer of transfers) {
      const [existing] = await tx.query<DbRow>('SELECT * FROM framed_sync_receipts WHERE transfer_id = ?',
        [transfer.input.transferId]);
      if (!existing) pending.push(transfer);
      else await replayRetiredParentOrderBodies(tx, transfer.decoded.readingStates);
    }
    await applyFacts(tx, pending);
    const receipts = await Promise.all(transfers.map((transfer) => commitReceipt(tx, transfer)));
    return receipts;
  });
}

async function applyFacts(db: DbPort, transfers: readonly Prepared[]) {
  const nodes = transfers.flatMap((transfer) => transfer.decoded.nodes);
  await recordFramedSyncResourceAvailability(db, transfers.flatMap((transfer) =>
    (transfer.input.resourceStorageKeys ?? []).map((key) => key.slice(0, 64))), true);
  await assertFramedSyncNodeParentDependencies(db, nodes);
  if (nodes.length) await applyConvergentSyncNodesWithDbPort(db, nodes);
  await applyFramedSyncRelationReviewFactsWithDbPort(db, transfers.flatMap((transfer) => transfer.decoded.relationReviewFacts));
  const records = transfers.flatMap((transfer) => transfer.decoded.readingStates);
  const hostName = records.some((record) => record.object_type === 'setting')
    ? await iosCompanionHostName(db) : undefined;
  for (const transfer of transfers) for (const record of transfer.decoded.readingStates) {
    await applyFramedSyncObjectStateRecord(db,
      withFramedExternalDocumentBody(record, transfer.decoded.externalBodies ?? []), hostName ? { hostName } : {});
  }
}

async function commitReceipt(db: DbPort, transfer: Prepared): Promise<TransferReceiptStage> {
  const { input, contentId, decoded } = transfer;
  const identity = { contentId, receiverDeviceId: input.receiverDeviceId,
    receiverLibraryEpoch: input.receiverLibraryEpoch, transferId: input.transferId };
  const [existing] = await db.query<DbRow>('SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [input.transferId]);
  if (existing) {
    const stored = readFramedSyncReceipt(existing);
    if (!sameFramedSyncBytes(stored.contentId, contentId) || stored.receiverDeviceId !== input.receiverDeviceId ||
        stored.receiverLibraryEpoch !== input.receiverLibraryEpoch) throw new Error('receipt_identity_conflict');
    return stored;
  }
  const current = await readFramedSyncInventoryEntry(db, { globalId: decoded.globalId, objectType: decoded.objectType });
  if (!current) throw new Error('framed_sync_applied_state_missing');
  const receipt = { ...identity, appliedStateHash: current.sharedStateHash };
  await db.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [receipt.transferId,
    receipt.contentId, receipt.receiverDeviceId, receipt.receiverLibraryEpoch, receipt.appliedStateHash]);
  await markFramedSyncCompletion(db, receipt.transferId);
  return receipt;
}

import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { readFramedSyncReceipt, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { assertFramedSyncNodeParentDependencies } from '../../../../../../lib/core/sync/framedSyncNodeParentDependencies.js';
import { applyFramedSyncObjectStateRecord } from '../../../../../../lib/core/sync/framedSyncObjectStateFact.js';
import { applyFramedSyncRelationReviewFactsWithDbPort } from '../../../../../../lib/core/sync/framedSyncRelationReviewApply.js';
import { replayRetiredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyReplay.js';
import { assertSyncGroupLocalPublicationAllowed, finishSyncGroupLocalAdoption, type SyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { clearWorkgroupSyncDataForRestore } from '../../../../../../lib/core/sync/syncGroupRestoreReset.js';
import { applySyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeApplyExecutor.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../../lib/core/sync/syncNodeConvergence.js';
import { upsertTextBodyBlob } from '../../../../../../lib/core/sync/syncNodeTextBodyBlobs.js';
import { isNodeVersionIdentityOnly } from '../../../../../../lib/core/sync/syncNodeVersionHistory.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import type { prepareCompanionFramedSyncTransfer } from './companionFramedSyncApply.js';

type Prepared = Awaited<ReturnType<typeof prepareCompanionFramedSyncTransfer>>;

export function applyPreparedCompanionFramedSyncTransfers(
  db: DbPort, transfers: readonly Prepared[], adoption?: SyncGroupLocalAdoption
) {
  return db.transaction(async (tx) => {
    if (adoption) await clearWorkgroupSyncDataForRestore(tx, adoption.libraryEpoch);
    else await assertSyncGroupLocalPublicationAllowed(tx);
    const pending = [];
    for (const transfer of transfers) {
      const [existing] = await tx.query<DbRow>('SELECT * FROM framed_sync_receipts WHERE transfer_id = ?',
        [transfer.input.transferId]);
      if (!existing) pending.push(transfer);
      else await replayRetiredParentOrderBodies(tx, transfer.decoded.readingStates);
    }
    await applyFacts(tx, pending, Boolean(adoption));
    const receipts = await Promise.all(transfers.map((transfer) => commitReceipt(tx, transfer)));
    if (adoption) await finishSyncGroupLocalAdoption(tx, adoption);
    return receipts;
  });
}

async function applyFacts(db: DbPort, transfers: readonly Prepared[], replacing: boolean) {
  const nodes = transfers.flatMap((transfer) => transfer.decoded.nodes);
  await recordFramedSyncResourceAvailability(db, transfers.flatMap((transfer) =>
    (transfer.input.resourceStorageKeys ?? []).map((key) => key.slice(0, 64))), true);
  await assertFramedSyncNodeParentDependencies(db, nodes);
  for (const node of nodes) {
    if (isNodeVersionIdentityOnly(node)) continue;
    await upsertTextBodyBlob(db, node.body_text ?? '', node.snapshot.updated_at, node.snapshot.body_blob_hash!);
  }
  if (nodes.length) {
    if (replacing) await applySyncNodesWithDbPort(db, nodes, {
      enqueueSearchInvalidations: false, operation: 'local_restore'
    });
    else await applyConvergentSyncNodesWithDbPort(db, nodes);
  }
  await applyFramedSyncRelationReviewFactsWithDbPort(db, transfers.flatMap((transfer) => transfer.decoded.relationReviewFacts));
  for (const body of transfers.flatMap((transfer) => transfer.decoded.externalBodies ?? [])) {
    await upsertTextBodyBlob(db, body.text, new Date().toISOString(), body.hash);
  }
  const records = transfers.flatMap((transfer) => transfer.decoded.readingStates);
  const hostName = records.some((record) => record.object_type === 'setting')
    ? await iosCompanionHostName(db) : undefined;
  for (const record of records) await applyFramedSyncObjectStateRecord(db, record, hostName ? { hostName } : {});
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
  return receipt;
}

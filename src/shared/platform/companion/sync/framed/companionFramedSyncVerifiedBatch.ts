import { collectBodyContentCandidates } from '../../../../../../lib/core/database/bodyContentCollection.js';
import { verifyAvailableBlobChunks } from '../../../../../../lib/core/database/framedSyncAvailableBlobVerification.js';
import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { applyVerifiedFramedFactUnits } from '../../../../../../lib/core/sync/framedSyncVerifiedFactApply.js';
import { replayRetiredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyReplay.js';
import { assertSyncGroupLocalPublicationAllowed, finishSyncGroupLocalAdoption,
  type SyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { clearWorkgroupSyncDataForRestore } from '../../../../../../lib/core/sync/syncGroupRestoreReset.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { adoptCompanionStagedBody } from './companionFramedSyncBodyAdoption.js';
import { loadVerifiedCompanionReady } from './companionFramedSyncVerifiedReady.js';
import { commitVerifiedCompanionReceipt, existingVerifiedCompanionReceipt } from './companionFramedSyncVerifiedReceipt.js';

type Ready = Awaited<ReturnType<typeof loadVerifiedCompanionReady>>;
type Transfer = { input: CompanionFramedSyncApplyInput; ready: Ready; existing: TransferReceiptStage | null };

async function loadTransfers(db: DbPort, inputs: readonly CompanionFramedSyncApplyInput[]) {
  const transfers: Transfer[] = [];
  for (const input of inputs) {
    const ready = await loadVerifiedCompanionReady(db, input);
    const existing = await existingVerifiedCompanionReceipt(db, input, ready);
    if (existing) {
      for (const descriptor of ready.descriptors) await verifyAvailableBlobChunks(db, input.stagingKind, descriptor);
      await replayRetiredParentOrderBodies(db, ready.readingStates);
    }
    transfers.push({ input, ready, existing });
  }
  return transfers;
}

async function applyPending(db: DbPort, pending: readonly Transfer[], adoption: boolean) {
  const now = new Date().toISOString();
  for (const { input, ready } of pending) for (const descriptor of ready.descriptors) {
    await adoptCompanionStagedBody(db, input, descriptor, now, 'chunked');
  }
  await recordFramedSyncResourceAvailability(db, pending.flatMap(({ input }) =>
    (input.resourceStorageKeys ?? []).map((key) => key.slice(0, 64))), true);
  const hostName = pending.some(({ ready }) => ready.facts.some((fact) => fact.objectType === 'setting'))
    ? await iosCompanionHostName(db) : undefined;
  await applyVerifiedFramedFactUnits(db, pending.map(({ ready }) => ready.facts), {
    ...(adoption ? { operation: 'local_restore' } : {}),
    enqueueSearchInvalidations: false, objectOptions: hostName ? { hostName } : {}
  });
}

async function collectRestoredBodies(db: DbPort) {
  let after = '';
  for (;;) {
    const [row] = await db.query<{ hash: string }>(
      "SELECT hash FROM content_blobs WHERE kind = 'text_body' AND hash > ? ORDER BY hash LIMIT 1", [after]);
    if (!row) return;
    await collectBodyContentCandidates(db, [row.hash]);
    after = row.hash;
  }
}

/** The caller owns the single attached staging database throughout this transaction. */
export async function applyVerifiedCompanionBatchInTransaction(db: DbPort,
  inputs: readonly CompanionFramedSyncApplyInput[], adoption?: SyncGroupLocalAdoption) {
  return db.transaction(async (tx) => {
    if (adoption) await clearWorkgroupSyncDataForRestore(tx, adoption.libraryEpoch, 'chunked');
    else await assertSyncGroupLocalPublicationAllowed(tx);
    const transfers = await loadTransfers(tx, inputs);
    await applyPending(tx, transfers.filter((transfer) => !transfer.existing), Boolean(adoption));
    const receipts: TransferReceiptStage[] = [];
    for (const { input, ready, existing } of transfers) {
      receipts.push(existing ?? await commitVerifiedCompanionReceipt(tx, input, ready));
    }
    if (adoption) {
      await finishSyncGroupLocalAdoption(tx, adoption);
      await collectRestoredBodies(tx);
    }
    return receipts;
  });
}

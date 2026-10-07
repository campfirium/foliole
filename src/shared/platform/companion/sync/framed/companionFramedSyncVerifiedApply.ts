import { verifyAvailableBlobChunks } from '../../../../../../lib/core/database/framedSyncAvailableBlobVerification.js';
import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import { readFramedSyncReceipt, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort, DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import { markFramedSyncCompletion } from '../../../../../../lib/core/sync/framedSyncCompletionRetention.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { applyVerifiedFramedFactUnit } from '../../../../../../lib/core/sync/framedSyncVerifiedFactApply.js';
import { replayRetiredParentOrderBodies } from '../../../../../../lib/core/sync/parentOrderBodyReplay.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { adoptCompanionStagedBody } from './companionFramedSyncBodyAdoption.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';
import { loadVerifiedCompanionReady } from './companionFramedSyncVerifiedReady.js';

type Ready = Awaited<ReturnType<typeof loadVerifiedCompanionReady>>;

/** Explicit stable-storage candidate. Native staging retains its pins until the bridge result is acknowledged. */
export async function applyVerifiedCompanionFramedSyncTransfer(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const tables = STAGING_TABLES[input.stagingKind];
  if (!tables) throw new Error('framed_sync_staging_kind_invalid');
  if (!input.stagingPath) throw new Error('framed_sync_staging_path_required');
  const path = `'${input.stagingPath.replaceAll("'", "''")}'`;
  await db.run(`ATTACH DATABASE ${path} AS ${tables.alias}`);
  try {
    return await db.transaction(async (tx) => {
      await assertSyncGroupLocalPublicationAllowed(tx);
      const ready = await loadVerifiedCompanionReady(tx, input);
      const existing = await existingReceipt(tx, input, ready);
      if (existing) {
        for (const descriptor of ready.descriptors) await verifyAvailableBlobChunks(tx, input.stagingKind, descriptor);
        await replayRetiredParentOrderBodies(tx, ready.readingStates);
        return existing;
      }
      const now = new Date().toISOString();
      for (const descriptor of ready.descriptors) {
        await adoptCompanionStagedBody(tx, input, descriptor, now, 'chunked');
      }
      await recordFramedSyncResourceAvailability(tx,
        (input.resourceStorageKeys ?? []).map((key) => key.slice(0, 64)), true);
      const hostName = ready.facts.some((fact) => fact.objectType === 'setting')
        ? await iosCompanionHostName(tx) : undefined;
      await applyVerifiedFramedFactUnit(tx, ready.facts,
        { enqueueSearchInvalidations: false, objectOptions: hostName ? { hostName } : {} });
      return commitReceipt(tx, input, ready);
    });
  } finally {
    await db.run(`DETACH DATABASE ${tables.alias}`);
  }
}

async function existingReceipt(db: DbPort, input: CompanionFramedSyncApplyInput,
  ready: Ready): Promise<TransferReceiptStage | null> {
  const [row] = await db.query<DbRow>('SELECT * FROM framed_sync_receipts WHERE transfer_id = ?', [input.transferId]);
  if (!row) return null;
  const stored = readFramedSyncReceipt(row);
  if (!sameFramedSyncBytes(stored.contentId, ready.contentId) || stored.receiverDeviceId !== input.receiverDeviceId ||
      stored.receiverLibraryEpoch !== input.receiverLibraryEpoch) throw new Error('receipt_identity_conflict');
  return stored;
}

async function commitReceipt(db: DbPort, input: CompanionFramedSyncApplyInput, ready: Ready): Promise<TransferReceiptStage> {
  const current = await readFramedSyncInventoryEntry(db,
    { globalId: ready.globalId, objectType: ready.objectType }, 'chunked');
  if (!current) throw new Error('framed_sync_applied_state_missing');
  const receipt = { contentId: ready.contentId, receiverDeviceId: input.receiverDeviceId,
    receiverLibraryEpoch: input.receiverLibraryEpoch, transferId: input.transferId, appliedStateHash: current.sharedStateHash };
  await db.run('INSERT INTO framed_sync_receipts VALUES (?, ?, ?, ?, ?)', [receipt.transferId,
    receipt.contentId, receipt.receiverDeviceId, receipt.receiverLibraryEpoch, receipt.appliedStateHash]);
  await markFramedSyncCompletion(db, receipt.transferId);
  return receipt;
}

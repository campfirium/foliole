import { recordFramedSyncResourceAvailability } from '../../../../../../lib/core/database/framedSyncResourceAvailability.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import type { TransferReceiptStage } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { applyFramedFactSources } from '../../../../../../lib/core/sync/framedSyncFactApply.js';
import { validateFramedSyncFrozenBody } from '../../../../../../lib/core/sync/framedSyncFrozenBody.js';
import type { FramedBodyLoader } from '../../../../../../lib/core/sync/framedSyncNodeRecordSource.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { assertCompanionFramedSyncInboundAllowed } from './companionFramedSyncInboundGate.js';
import { replayCompanionReadyOrderBodies } from './companionFramedSyncReadySummary.js';
import { applyCompanionFramedResourceAvailability, finishCompanionFramedResourceDemand } from './companionFramedSyncResourceApply.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';
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
      for (const descriptor of ready.descriptors) await readyBodyLoader(input)(db, descriptor);
      await replayCompanionReadyOrderBodies(db, ready.source);
    }
    transfers.push({ input, ready, existing });
  }
  return transfers;
}

async function applyPending(db: DbPort, pending: readonly Transfer[]) {
  for (const { ready } of pending) if (ready.resourceUnit) {
    await applyCompanionFramedResourceAvailability(db, ready.resourceUnit);
  }
  const databaseUnits = pending.filter(({ ready }) => !ready.resourceUnit);
  if (!databaseUnits.length) return;
  await recordFramedSyncResourceAvailability(db, databaseUnits.flatMap(({ input }) =>
    (input.resourceStorageKeys ?? []).map((key) => key.slice(0, 64))), true);
  const hostName = databaseUnits.some(({ ready }) => ready.objectType === 'setting')
    ? await iosCompanionHostName(db) : undefined;
  await applyFramedFactSources(db, databaseUnits.map(({ ready }) => ready.source), {
    loadBody: readyBodyLoader(databaseUnits[0]!.input), objectOptions: hostName ? { hostName } : {}
  });
}

/** The caller owns the single attached staging database throughout this transaction. */
export async function applyVerifiedCompanionBatchInTransaction(db: DbPort,
  inputs: readonly CompanionFramedSyncApplyInput[]) {
  return db.transaction(async (tx) => {
    await assertCompanionFramedSyncInboundAllowed(tx, inputs);
    const transfers = await loadTransfers(tx, inputs);
    await applyPending(tx, transfers.filter((transfer) => !transfer.existing));
    const receipts: TransferReceiptStage[] = [];
    for (const { input, ready, existing } of transfers) {
      receipts.push(existing ?? await commitVerifiedCompanionReceipt(tx, input, ready));
      if (ready.resourceUnit) await finishCompanionFramedResourceDemand(tx, input, ready.resourceUnit);
    }
    return receipts;
  });
}

function readyBodyLoader(input: CompanionFramedSyncApplyInput): FramedBodyLoader {
  const tables = STAGING_TABLES[input.stagingKind];
  return async (db, descriptor) => {
    const [row] = await db.query<{ data: Uint8Array | null; byte_length: number;
      data_type: string; actual_byte_length: number | null }>(
      `SELECT data, byte_length, typeof(data) AS data_type, length(data) AS actual_byte_length
       FROM ${tables.alias}.${tables.prefix}_available_blobs WHERE sha256 = ?`, [descriptor.sha256]);
    if (!row || BigInt(row.byte_length) !== descriptor.byteLength) throw new Error('framed_sync_published_body_unavailable');
    // iOS SQLite returns null for a genuine zero-length BLOB pointer.
    const data = row.data === null && descriptor.byteLength === 0n &&
      row.data_type === 'blob' && row.actual_byte_length === 0 ? new Uint8Array() : row.data;
    if (data === null) throw new Error('framed_sync_published_body_unavailable');
    return validateFramedSyncFrozenBody(descriptor, data);
  };
}

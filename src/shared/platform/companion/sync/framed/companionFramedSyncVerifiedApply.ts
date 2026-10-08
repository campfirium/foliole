import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';
import { STAGING_TABLES } from './companionFramedSyncStagingTables.js';
import { applyVerifiedCompanionBatchInTransaction } from './companionFramedSyncVerifiedBatch.js';

function stagingOwner(inputs: readonly CompanionFramedSyncApplyInput[]) {
  const first = inputs[0];
  if (!first) return null;
  const tables = STAGING_TABLES[first.stagingKind];
  if (!tables) throw new Error('framed_sync_staging_kind_invalid');
  if (!first.stagingPath) throw new Error('framed_sync_staging_path_required');
  for (const input of inputs) {
    if (!STAGING_TABLES[input.stagingKind]) throw new Error('framed_sync_staging_kind_invalid');
    if (!input.stagingPath) throw new Error('framed_sync_staging_path_required');
    if (input.stagingKind !== first.stagingKind || input.stagingPath !== first.stagingPath) {
      throw new Error('framed_sync_staging_owner_mismatch');
    }
  }
  return { alias: tables.alias, path: `'${first.stagingPath.replaceAll("'", "''")}'` };
}

/** Explicit stable-storage candidate. Native staging retains pins until receipts are acknowledged. */
export async function applyVerifiedCompanionFramedSyncTransfers(db: DbPort,
  inputs: readonly CompanionFramedSyncApplyInput[]) {
  const owner = stagingOwner(inputs);
  if (!owner) return applyVerifiedCompanionBatchInTransaction(db, inputs);
  await db.run(`ATTACH DATABASE ${owner.path} AS ${owner.alias}`);
  try {
    return await applyVerifiedCompanionBatchInTransaction(db, inputs);
  } finally {
    await db.run(`DETACH DATABASE ${owner.alias}`);
  }
}

export async function applyVerifiedCompanionFramedSyncTransfer(db: DbPort, input: CompanionFramedSyncApplyInput) {
  const [receipt] = await applyVerifiedCompanionFramedSyncTransfers(db, [input]);
  if (!receipt) throw new Error('framed_sync_applied_receipt_missing');
  return receipt;
}

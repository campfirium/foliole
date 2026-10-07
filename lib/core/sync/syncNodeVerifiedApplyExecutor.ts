import type { NativeSyncNodeConflictRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import type { ApplySyncNodesWithDbPortOptions, ApplySyncNodesWithDbPortResult } from './syncNodeApplyExecutor.js';
import { decideIncomingNodeApply, latestBranchHeadRecords, orderNodesForApply } from './syncNodeApplyRules.js';
import { hasCompleteVerifiedTombstoneVersion } from './syncNodeBodyPayloadHash.js';
import { applyVerifiedCurrentNodeInTransaction, loadVerifiedCurrentNodeApplyState } from './syncNodeVerifiedCurrentApply.js';
import { upsertVerifiedSyncNodeVersion } from './syncNodeVerifiedVersionWrite.js';
import { orderNodeVersionHistory } from './syncNodeVersionHistory.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

export interface ApplyVerifiedSyncNodesResult extends Omit<ApplySyncNodesWithDbPortResult, 'conflictNodes'> {
  conflictNodes: VerifiedFramedSyncNode[];
  conflictRecords: NativeSyncNodeConflictRecord[];
}

/** Requires the formal chunk schema and verified durable owners. No string-body application path. */
export async function applyVerifiedSyncNodesWithDbPort(db: DbPort, records: readonly VerifiedFramedSyncNode[],
  options: Omit<ApplySyncNodesWithDbPortOptions, 'hashTextBody'> = {}): Promise<ApplyVerifiedSyncNodesResult> {
  const result: ApplyVerifiedSyncNodesResult = { appliedIds: [], anchorRepairRecords: [], blockedIds: [],
    conflictRecords: [], conflictNodes: [], skippedConflictCopyIds: [], tombstoneBlockedIds: [], unmappedAnchorRecords: [] };
  const byMetadata = new Map(records.map((record) => [record.metadata, record]));
  const ordered = orderNodesForApply(latestBranchHeadRecords(records
    .filter((record) => record.metadata.is_tombstone || record.body.kind === 'readable').map((record) => record.metadata)))
    .map((meta) => byMetadata.get(meta)!);
  const excludedNodeIds = new Set(ordered.map((record) => record.metadata.object_id));
  const invalidatedAt = new Date().toISOString();
  await assertRestoreCanApply(db, ordered, options.operation);
  await db.transaction(async (tx) => {
    const history = await retainedHistory(tx, records);
    for (const record of history) await upsertVerifiedSyncNodeVersion(tx, record);
    for (const record of ordered) {
      await applyVerifiedCurrentNodeInTransaction(tx, record, { ...options, excludedNodeIds, invalidatedAt }, result);
    }
    for (const record of history) await upsertVerifiedSyncNodeVersion(tx, record);
    if (options.operation === 'local_restore' && result.appliedIds.length !== ordered.length) throw new Error('local_restore_not_applied');
    if (result.appliedIds.length > 0) await pruneLearningRowsWithoutVisibleNodes(tx);
  });
  return result;
}

async function assertRestoreCanApply(db: DbPort, records: readonly VerifiedFramedSyncNode[], operation?: ApplySyncNodesWithDbPortOptions['operation']) {
  if (operation !== 'local_restore') return;
  for (const record of records) {
    const decision = decideIncomingNodeApply(await loadVerifiedCurrentNodeApplyState(db, record.metadata.object_id), record.metadata, operation);
    if (decision === 'block_incoming' || decision === 'record_conflict') throw new Error('local_restore_not_applied');
  }
}

async function retainedHistory(db: DbPort, records: readonly VerifiedFramedSyncNode[]) {
  const eligible: VerifiedFramedSyncNode[] = [];
  for (const record of records) {
    const meta = record.metadata;
    if (!meta.version_id || !meta.host_name || !meta.version_created_at ||
        meta.is_tombstone && !await hasCompleteVerifiedTombstoneVersion(db, record)) continue;
    eligible.push(record);
  }
  const byMetadata = new Map(eligible.map((record) => [record.metadata, record]));
  return orderNodeVersionHistory(eligible.map((record) => record.metadata)).map((meta) => byMetadata.get(meta)!);
}

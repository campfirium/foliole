import type { NativeSyncNodeConflictRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import type { ApplySyncNodesWithDbPortOptions, ApplySyncNodesWithDbPortResult } from './syncNodeApplyExecutor.js';
import { decideIncomingNodeApply, latestBranchHeadRecords, orderNodesForApply, type LocalSyncNodeState } from './syncNodeApplyRules.js';
import { hasCompleteVerifiedTombstoneVersion } from './syncNodeBodyPayloadHash.js';
import { toSyncNodeConflictRecord } from './syncNodeConflictRecord.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { applyRemoteNodeTombstone, loadNodeSyncTombstone } from './syncNodeTombstoneApply.js';
import { decideVerifiedNodeApply } from './syncNodeVerifiedApplyDecision.js';
import { writeVerifiedCurrentNode } from './syncNodeVerifiedCurrentWrite.js';
import { upsertVerifiedSyncNodeVersion } from './syncNodeVerifiedVersionWrite.js';
import { orderNodeVersionHistory } from './syncNodeVersionHistory.js';
import { pruneLearningRowsWithoutVisibleNodes } from './syncNodeVisibilityPruning.js';

export interface ApplyVerifiedSyncNodesResult extends Omit<ApplySyncNodesWithDbPortResult, 'conflictNodes'> {
  conflictNodes: VerifiedFramedSyncNode[];
  conflictRecords: NativeSyncNodeConflictRecord[];
}

interface LocalNodeStateRow extends DbRow, LocalSyncNodeState {
  parent_id: string | null;
  title: string;
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
      const meta = record.metadata;
      if (meta.is_tombstone) {
        if (await applyRemoteNodeTombstone(tx, meta, options.enqueueSearchInvalidations !== false)) result.appliedIds.push(meta.object_id);
        continue;
      }
      if (await loadNodeSyncTombstone(tx, meta.object_id)) { result.tombstoneBlockedIds.push(meta.object_id); continue; }
      const local = await localState(tx, meta.object_id);
      const decision = await decideVerifiedNodeApply(tx, local, record, options.operation);
      if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
        const repairs = await writeVerifiedCurrentNode(tx, record, { ...options, excludedNodeIds, invalidatedAt });
        result.anchorRepairRecords.push(...repairs.repaired);
        result.unmappedAnchorRecords.push(...repairs.unmapped);
        result.appliedIds.push(meta.object_id);
      } else if (decision === 'already_applied') {
        const state = await upsertAppliedNodeSyncState(tx, meta);
        if (state.changes > 0 || options.includeAlreadyApplied) result.appliedIds.push(meta.object_id);
      } else if (decision === 'block_incoming') result.blockedIds.push(meta.object_id);
      else if (decision === 'record_conflict') {
        result.conflictRecords.push(toSyncNodeConflictRecord(meta)); result.conflictNodes.push(record);
      }
    }
    for (const record of history) await upsertVerifiedSyncNodeVersion(tx, record);
    if (options.operation === 'local_restore' && result.appliedIds.length !== ordered.length) throw new Error('local_restore_not_applied');
    if (result.appliedIds.length > 0) await pruneLearningRowsWithoutVisibleNodes(tx);
  });
  return result;
}

function localState(db: DbPort, objectId: string) {
  return db.query<LocalNodeStateRow>(
    'SELECT current_version_id, deleted_at, parent_id, sync_dirty, title FROM nodes WHERE id = ?', [objectId])
    .then((rows) => rows[0] ?? null);
}

async function assertRestoreCanApply(db: DbPort, records: readonly VerifiedFramedSyncNode[], operation?: ApplySyncNodesWithDbPortOptions['operation']) {
  if (operation !== 'local_restore') return;
  for (const record of records) {
    const decision = decideIncomingNodeApply(await localState(db, record.metadata.object_id), record.metadata, operation);
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

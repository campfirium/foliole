import type { DbPort, DbRow } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import type { ApplySyncNodesWithDbPortOptions } from './syncNodeApplyExecutor.js';
import type { LocalSyncNodeState } from './syncNodeApplyRules.js';
import { toSyncNodeConflictRecord } from './syncNodeConflictRecord.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { applyRemoteNodeTombstone, loadNodeSyncTombstone } from './syncNodeTombstoneApply.js';
import { decideVerifiedNodeApply } from './syncNodeVerifiedApplyDecision.js';
import type { ApplyVerifiedSyncNodesResult } from './syncNodeVerifiedApplyExecutor.js';
import { writeVerifiedCurrentNode } from './syncNodeVerifiedCurrentWrite.js';

interface LocalNodeStateRow extends DbRow, LocalSyncNodeState {
  parent_id: string | null;
  title: string;
}

export function loadVerifiedCurrentNodeApplyState(db: DbPort, objectId: string) {
  return db.query<LocalNodeStateRow>(
    'SELECT current_version_id, deleted_at, parent_id, sync_dirty, title FROM nodes WHERE id = ?', [objectId])
    .then((rows) => rows[0] ?? null);
}

/** Caller retains ordering, history writes and the encompassing business transaction. */
export async function applyVerifiedCurrentNodeInTransaction(tx: DbPort, record: VerifiedFramedSyncNode,
  options: Omit<ApplySyncNodesWithDbPortOptions, 'hashTextBody'> & {
    excludedNodeIds: ReadonlySet<string>; invalidatedAt: string;
  }, result: ApplyVerifiedSyncNodesResult) {
  const meta = record.metadata;
  if (meta.is_tombstone) {
    if (await applyRemoteNodeTombstone(tx, meta, options.enqueueSearchInvalidations !== false)) result.appliedIds.push(meta.object_id);
    return;
  }
  if (await loadNodeSyncTombstone(tx, meta.object_id)) { result.tombstoneBlockedIds.push(meta.object_id); return; }
  const local = await loadVerifiedCurrentNodeApplyState(tx, meta.object_id);
  const decision = await decideVerifiedNodeApply(tx, local, record, options.operation);
  if (decision === 'apply_missing_local' || decision === 'apply_fast_forward') {
    const repairs = await writeVerifiedCurrentNode(tx, record, options);
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

import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

export const CONFLICT_COPY_NODE_ID_PREFIX = 'conflict-copy-';

export interface LocalSyncNodeState {
  current_version_id: string | null;
  deleted_at: string | null;
  sync_dirty: number;
}

export type IncomingNodeApplyDecision =
  | 'apply_missing_local'
  | 'apply_fast_forward'
  | 'already_applied'
  | 'skip_stale'
  | 'block_incoming'
  | 'record_conflict';

export type SyncNodeApplyOperation = 'local_mutation' | 'local_restore' | 'remote_sync';

export function latestBranchHeadRecords(records: NativeSyncNodeRecord[]) {
  const versions = new Map(records.map((record) => [record.version_id, record]));
  const ancestors = new Set(records.flatMap((record) => [...record.ancestor_version_ids, ...record.parent_version_ids ?? [],
    ...(record.parent_version_id ? [record.parent_version_id] : [])]));
  return [...versions.values()].filter((record) => !record.version_id || !ancestors.has(record.version_id));
}

export function orderNodesForApply(records: NativeSyncNodeRecord[]) {
  const byId = new Map(records.map((record) => [record.object_id, record]));
  const ordered: NativeSyncNodeRecord[] = [];
  const visited = new Set<NativeSyncNodeRecord>();

  function visit(record: NativeSyncNodeRecord) {
    if (visited.has(record)) {
      return;
    }
    const parent = record.snapshot.parent_id ? byId.get(record.snapshot.parent_id) : null;
    if (parent) {
      visit(parent);
    }
    visited.add(record);
    ordered.push(record);
  }

  for (const record of records) {
    visit(record);
  }
  return ordered;
}

export function isRemoteFastForward(record: NativeSyncNodeRecord, localVersionId: string | null | undefined) {
  if (!localVersionId || record.version_id === localVersionId) {
    return true;
  }
  if (record.parent_version_id === localVersionId) {
    return true;
  }
  return record.ancestor_version_ids.includes(localVersionId);
}

export function blocksIncomingNodeVersion(local: LocalSyncNodeState, record: NativeSyncNodeRecord) {
  if (record.version_id === local.current_version_id) {
    return false;
  }
  if (record.snapshot.deleted_at) {
    return false;
  }
  if (local.sync_dirty === 1) {
    return true;
  }
  return Boolean(local.deleted_at && !record.snapshot.deleted_at);
}

function isExplicitLocalRestore(
  local: LocalSyncNodeState,
  record: NativeSyncNodeRecord,
  operation: SyncNodeApplyOperation
) {
  return operation === 'local_restore'
    && Boolean(local.deleted_at)
    && !record.snapshot.deleted_at
    && record.version_id !== local.current_version_id
    && record.parent_version_id === local.current_version_id;
}

function isExplicitLocalMutation(
  local: LocalSyncNodeState,
  record: NativeSyncNodeRecord,
  operation: SyncNodeApplyOperation
) {
  return operation === 'local_mutation'
    && !local.deleted_at
    && !record.snapshot.deleted_at
    && record.version_id !== local.current_version_id
    && record.parent_version_id === local.current_version_id;
}

export function decideIncomingNodeApply(
  local: LocalSyncNodeState | null,
  record: NativeSyncNodeRecord,
  operation: SyncNodeApplyOperation = 'remote_sync'
): IncomingNodeApplyDecision {
  if (!local) {
    return 'apply_missing_local';
  }
  if (isExplicitLocalRestore(local, record, operation)) {
    return 'apply_fast_forward';
  }
  if (local.deleted_at && !record.snapshot.deleted_at
      && isRemoteFastForward(record, local.current_version_id)) {
    return 'apply_fast_forward';
  }
  if (isExplicitLocalMutation(local, record, operation)) {
    return 'apply_fast_forward';
  }
  if (local.deleted_at && !record.snapshot.deleted_at) {
    return 'block_incoming';
  }
  if (!isRemoteFastForward(record, local.current_version_id)) {
    return 'record_conflict';
  }
  if (blocksIncomingNodeVersion(local, record)) {
    return 'block_incoming';
  }
  if (record.version_id === local.current_version_id) {
    return 'already_applied';
  }
  return 'apply_fast_forward';
}

export function isConflictCopyNodeId(nodeId: string) {
  return nodeId.startsWith(CONFLICT_COPY_NODE_ID_PREFIX);
}

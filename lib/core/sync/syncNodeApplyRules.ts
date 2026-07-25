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
  | 'block_incoming'
  | 'record_conflict';

export type SyncNodeApplyOperation = 'local_restore' | 'remote_sync';

function branchRecordKey(record: NativeSyncNodeRecord) {
  return `${record.object_id}\n${record.device_id?.trim() || 'remote'}`;
}

function compareRecordHead(left: NativeSyncNodeRecord, right: NativeSyncNodeRecord) {
  const timeCompare = (left.version_created_at ?? left.updated_at ?? '').localeCompare(
    right.version_created_at ?? right.updated_at ?? ''
  );
  return timeCompare === 0 ? (left.version_id ?? '').localeCompare(right.version_id ?? '') : timeCompare;
}

export function latestBranchHeadRecords(records: NativeSyncNodeRecord[]) {
  const byBranch = new Map<string, NativeSyncNodeRecord>();
  for (const record of records) {
    const key = branchRecordKey(record);
    const current = byBranch.get(key);
    if (!current || compareRecordHead(current, record) < 0) {
      byBranch.set(key, record);
    }
  }
  return [...byBranch.values()];
}

export function orderNodesForApply(records: NativeSyncNodeRecord[]) {
  const byId = new Map(records.map((record) => [record.object_id, record]));
  const ordered: NativeSyncNodeRecord[] = [];
  const visited = new Set<string>();

  function visit(record: NativeSyncNodeRecord) {
    if (visited.has(record.object_id)) {
      return;
    }
    const parent = record.snapshot.parent_id ? byId.get(record.snapshot.parent_id) : null;
    if (parent) {
      visit(parent);
    }
    visited.add(record.object_id);
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

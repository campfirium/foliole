import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord
} from '../../platform/nativeStorageContract.js';

export type SyncNodeInspectionDecision =
  | 'already_in_sync'
  | 'accept_remote_descendant'
  | 'accept_remote_fast_forward'
  | 'accept_remote_missing_local'
  | 'equivalent_content'
  | 'conflict';

export interface PlannedSyncNodeAction {
  decision: SyncNodeInspectionDecision;
  local: NativeSyncIndexEntry | null;
  remote: NativeSyncNodeRecord;
}

export interface SyncNodePullPlan {
  acceptRemote: PlannedSyncNodeAction[];
  alreadyInSync: PlannedSyncNodeAction[];
  conflicts: PlannedSyncNodeAction[];
  equivalentContent: PlannedSyncNodeAction[];
}

function compareObjectId(
  left: { object_id: string },
  right: { object_id: string }
) {
  return left.object_id.localeCompare(right.object_id);
}

function buildLocalIndexByObjectId(entries: NativeSyncIndexEntry[]) {
  const byObjectId = new Map<string, NativeSyncIndexEntry>();
  for (const entry of entries) {
    if (byObjectId.has(entry.object_id)) {
      throw new Error(`duplicate local sync index entry for object_id ${entry.object_id}`);
    }
    byObjectId.set(entry.object_id, entry);
  }
  return byObjectId;
}

export function decideSyncNodeFromRemote(
  local: NativeSyncIndexEntry | null,
  remote: NativeSyncNodeRecord
): SyncNodeInspectionDecision {
  if (!local) {
    return 'accept_remote_missing_local';
  }
  if (local.sync_version_id === remote.version_id && local.content_hash === remote.content_hash) {
    return 'already_in_sync';
  }
  if (local.content_hash && remote.content_hash && local.content_hash === remote.content_hash) {
    return 'equivalent_content';
  }
  if (remote.parent_version_id === local.sync_version_id) {
    return 'accept_remote_fast_forward';
  }
  if (local.sync_version_id && remote.ancestor_version_ids.includes(local.sync_version_id)) {
    return 'accept_remote_descendant';
  }
  return 'conflict';
}

export function planSyncNodesFromRemote(
  localEntries: NativeSyncIndexEntry[],
  remoteNodes: NativeSyncNodeRecord[]
): SyncNodePullPlan {
  const localByObjectId = buildLocalIndexByObjectId(localEntries);
  const acceptRemote: PlannedSyncNodeAction[] = [];
  const alreadyInSync: PlannedSyncNodeAction[] = [];
  const conflicts: PlannedSyncNodeAction[] = [];
  const equivalentContent: PlannedSyncNodeAction[] = [];

  for (const remote of [...remoteNodes].sort(compareObjectId)) {
    const local = localByObjectId.get(remote.object_id) ?? null;
    const action: PlannedSyncNodeAction = {
      decision: decideSyncNodeFromRemote(local, remote),
      local,
      remote
    };

    if (
      action.decision === 'accept_remote_missing_local' ||
      action.decision === 'accept_remote_fast_forward' ||
      action.decision === 'accept_remote_descendant'
    ) {
      acceptRemote.push(action);
      continue;
    }
    if (action.decision === 'already_in_sync') {
      alreadyInSync.push(action);
      continue;
    }
    if (action.decision === 'equivalent_content') {
      equivalentContent.push(action);
      continue;
    }
    conflicts.push(action);
  }

  return {
    acceptRemote,
    alreadyInSync,
    conflicts,
    equivalentContent
  };
}

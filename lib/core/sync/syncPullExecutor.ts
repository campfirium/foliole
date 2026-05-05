import type { NativeInvoke } from '../../platform/nativeContract.js';
import type {
  NativeSyncNodeConflictRecord,
  NativeSyncIndexEntry,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';
import {
  invokeApplySyncNodes,
  invokeRecordSyncNodeConflicts
} from '../../platform/nativeSyncInvoke.js';

import {
  planSyncNodesFromRemote,
  type PlannedSyncNodeAction,
  type SyncNodePullPlan
} from './syncNodePlan.js';

export interface ExecutedSyncNodePullPlan extends SyncNodePullPlan {
  appliedObjectIds: string[];
  alignedEquivalentObjectIds: string[];
  recordedConflictVersionIds: string[];
}

function collectAcceptedRemoteNodes(plan: SyncNodePullPlan) {
  return plan.acceptRemote.map((action) => action.remote);
}

function collectEquivalentRemoteNodes(plan: SyncNodePullPlan) {
  return plan.equivalentContent.map((action) => action.remote);
}

export async function executeSyncNodePullPlan(
  invoke: NativeInvoke,
  plan: SyncNodePullPlan
): Promise<ExecutedSyncNodePullPlan> {
  const acceptedRemoteNodes = collectAcceptedRemoteNodes(plan);
  const equivalentRemoteNodes = collectEquivalentRemoteNodes(plan);
  const conflictRecords = toConflictRecords(plan.conflicts);
  const appliedObjectIds = acceptedRemoteNodes.length > 0
    ? await invokeApplySyncNodes(invoke, { nodes: acceptedRemoteNodes })
    : [];
  const alignedEquivalentObjectIds = equivalentRemoteNodes.length > 0
    ? await invokeApplySyncNodes(invoke, { nodes: equivalentRemoteNodes })
    : [];
  const recordedConflictVersionIds = conflictRecords.length > 0
    ? await invokeRecordSyncNodeConflicts(invoke, { conflicts: conflictRecords })
    : [];

  return {
    ...plan,
    appliedObjectIds,
    alignedEquivalentObjectIds,
    recordedConflictVersionIds
  };
}

export async function planAndExecuteSyncNodesFromRemote(
  invoke: NativeInvoke,
  localEntries: NativeSyncIndexEntry[],
  remoteNodes: NativeSyncNodeRecord[]
): Promise<ExecutedSyncNodePullPlan> {
  const plan = planSyncNodesFromRemote(localEntries, remoteNodes);
  return executeSyncNodePullPlan(invoke, plan);
}

export function collectConflictObjectIds(actions: PlannedSyncNodeAction[]) {
  return actions.map((action) => action.remote.object_id);
}

function toConflictRecords(actions: PlannedSyncNodeAction[]): NativeSyncNodeConflictRecord[] {
  return actions.map((action) => ({
    conflict_version_id: action.remote.version_id,
    content_hash: action.remote.content_hash,
    device_id: action.remote.device_id,
    object_id: action.remote.object_id,
    parent_version_id: action.remote.parent_version_id,
    snapshot: action.remote.snapshot,
    updated_at: action.remote.updated_at
  }));
}

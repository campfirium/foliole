import type { NativeInvoke } from '../../platform/nativeContract.js';
import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord
} from '../../platform/nativeSyncContract.js';
import { invokeLoadSyncIndex } from '../../platform/nativeSyncInvoke.js';

import { diffSyncIndex, type SyncIndexDiffResult } from './syncIndexDiff.js';
import {
  planAndExecuteSyncNodesFromRemote,
  type ExecutedSyncNodePullPlan
} from './syncPullExecutor.js';

export interface SyncPullRemoteSource {
  loadSyncIndex(): Promise<NativeSyncIndexEntry[]>;
  loadSyncNodes(objectIds: string[]): Promise<NativeSyncNodeRecord[]>;
}

export interface SyncPullSessionResult {
  execution: ExecutedSyncNodePullPlan;
  indexDiff: SyncIndexDiffResult;
  localIndex: NativeSyncIndexEntry[];
  pendingPushObjectIds: string[];
  remoteIndex: NativeSyncIndexEntry[];
  requestedRemoteObjectIds: string[];
  requestedRemoteNodes: NativeSyncNodeRecord[];
}

function collectRequestedRemoteObjectIds(diff: SyncIndexDiffResult) {
  return [...new Set([
    ...diff.pullCandidates.map((entry) => entry.object_id),
    ...diff.inspectCandidates.map((entry) => entry.remote.object_id)
  ])].sort();
}

function createEmptyExecutionResult(): ExecutedSyncNodePullPlan {
  return {
    acceptRemote: [],
    alignedEquivalentObjectIds: [],
    alreadyInSync: [],
    appliedObjectIds: [],
    conflicts: [],
    equivalentContent: [],
    recordedConflictVersionIds: []
  };
}

export async function runSyncPullSession(
  localInvoke: NativeInvoke,
  remoteSource: SyncPullRemoteSource
): Promise<SyncPullSessionResult> {
  const [localIndex, remoteIndex] = await Promise.all([
    invokeLoadSyncIndex(localInvoke),
    remoteSource.loadSyncIndex()
  ]);
  const indexDiff = diffSyncIndex(localIndex, remoteIndex);
  const requestedRemoteObjectIds = collectRequestedRemoteObjectIds(indexDiff);
  const requestedRemoteNodes = requestedRemoteObjectIds.length > 0
    ? await remoteSource.loadSyncNodes(requestedRemoteObjectIds)
    : [];
  const execution = requestedRemoteNodes.length > 0
    ? await planAndExecuteSyncNodesFromRemote(localInvoke, localIndex, requestedRemoteNodes)
    : createEmptyExecutionResult();

  return {
    execution,
    indexDiff,
    localIndex,
    pendingPushObjectIds: indexDiff.pushCandidates.map((entry) => entry.object_id),
    remoteIndex,
    requestedRemoteObjectIds,
    requestedRemoteNodes
  };
}

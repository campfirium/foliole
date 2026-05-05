import type {
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncObjectType
} from '../../platform/nativeSyncContract.js';

import { diffSyncIndex, type SyncIndexDiffResult } from './syncIndexDiff.js';
import {
  planAndExecuteSyncNodesFromRemote,
  type ExecutedSyncNodePullPlan,
  type SyncNodePullTarget
} from './syncPullExecutor.js';

export interface SyncPullRemoteSource {
  loadSyncIndex(): Promise<NativeSyncIndexEntry[]>;
  loadSyncNodes(objectIds: string[]): Promise<NativeSyncNodeRecord[]>;
  loadSyncObjects(objectIds: string[], objectTypes?: string[]): Promise<NativeSyncObjectRecord[]>;
}

export interface SyncRuntimePort extends SyncPullRemoteSource, SyncNodePullTarget {
  applySyncObjects(objects: NativeSyncObjectRecord[]): Promise<string[]>;
}

export interface SyncPullSessionResult {
  appliedRemoteObjectIds: string[];
  execution: ExecutedSyncNodePullPlan;
  indexDiff: SyncIndexDiffResult;
  localIndex: NativeSyncIndexEntry[];
  pendingPushObjectIds: string[];
  remoteIndex: NativeSyncIndexEntry[];
  requestedRemoteObjectIds: string[];
  requestedRemoteNodes: NativeSyncNodeRecord[];
  requestedRemoteSyncObjects: NativeSyncObjectRecord[];
}

export interface SyncPushSessionResult {
  appliedLocalObjectIds: string[];
  execution: ExecutedSyncNodePullPlan;
  indexDiff: SyncIndexDiffResult;
  localIndex: NativeSyncIndexEntry[];
  pendingPullObjectIds: string[];
  remoteIndex: NativeSyncIndexEntry[];
  requestedLocalNodes: NativeSyncNodeRecord[];
  requestedLocalObjectIds: string[];
  requestedLocalSyncObjects: NativeSyncObjectRecord[];
}

function collectRequestedNodeIds(diff: SyncIndexDiffResult) {
  return [...new Set([
    ...diff.pullCandidates.filter((entry) => entry.object_type === 'node').map((entry) => entry.object_id),
    ...diff.inspectCandidates.filter((entry) => entry.remote.object_type === 'node').map((entry) => entry.remote.object_id)
  ])].sort();
}

function shouldPullGenericInspection(entry: SyncIndexDiffResult['inspectCandidates'][number]) {
  return entry.remote.object_type !== 'node' && entry.remote.updated_at >= entry.local.updated_at;
}

function collectRequestedObjectEntries(diff: SyncIndexDiffResult) {
  return [
    ...diff.pullCandidates.filter((entry) => entry.object_type !== 'node'),
    ...diff.inspectCandidates.filter(shouldPullGenericInspection).map((entry) => entry.remote)
  ].sort((left, right) => `${left.object_type}:${left.object_id}`.localeCompare(`${right.object_type}:${right.object_id}`));
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

function collectObjectTypes(entries: NativeSyncIndexEntry[]) {
  return [...new Set(entries.map((entry) => entry.object_type as Exclude<NativeSyncObjectType, 'node'>))].sort();
}

function collectObjectIds(entries: NativeSyncIndexEntry[]) {
  return [...new Set(entries.map((entry) => entry.object_id))].sort();
}

async function applyObjectBatch(target: SyncRuntimePort, objects: NativeSyncObjectRecord[]) {
  return objects.length > 0 ? target.applySyncObjects(objects) : [];
}

async function loadGenericObjects(source: SyncPullRemoteSource, entries: NativeSyncIndexEntry[]) {
  return entries.length > 0
    ? source.loadSyncObjects(collectObjectIds(entries), collectObjectTypes(entries))
    : [];
}

export async function runSyncPullSession(
  localRuntime: SyncRuntimePort,
  remoteSource: SyncPullRemoteSource
): Promise<SyncPullSessionResult> {
  const [localIndex, remoteIndex] = await Promise.all([
    localRuntime.loadSyncIndex(),
    remoteSource.loadSyncIndex()
  ]);
  const indexDiff = diffSyncIndex(localIndex, remoteIndex);
  const requestedRemoteObjectIds = collectRequestedNodeIds(indexDiff);
  const requestedObjectEntries = collectRequestedObjectEntries(indexDiff);
  const requestedRemoteNodes = requestedRemoteObjectIds.length > 0
    ? await remoteSource.loadSyncNodes(requestedRemoteObjectIds)
    : [];
  const requestedRemoteSyncObjects = await loadGenericObjects(remoteSource, requestedObjectEntries);
  const appliedRemoteObjectIds = await applyObjectBatch(localRuntime, requestedRemoteSyncObjects);
  const execution = requestedRemoteNodes.length > 0
    ? await planAndExecuteSyncNodesFromRemote(localRuntime, localIndex, requestedRemoteNodes)
    : createEmptyExecutionResult();

  return {
    appliedRemoteObjectIds,
    execution,
    indexDiff,
    localIndex,
    pendingPushObjectIds: indexDiff.pushCandidates.map((entry) => entry.object_id),
    remoteIndex,
    requestedRemoteObjectIds,
    requestedRemoteNodes,
    requestedRemoteSyncObjects
  };
}

export async function runSyncPushSession(
  localSource: SyncPullRemoteSource,
  remoteRuntime: SyncRuntimePort
): Promise<SyncPushSessionResult> {
  const [localIndex, remoteIndex] = await Promise.all([
    localSource.loadSyncIndex(),
    remoteRuntime.loadSyncIndex()
  ]);
  const indexDiff = diffSyncIndex(remoteIndex, localIndex);
  const requestedLocalObjectIds = collectRequestedNodeIds(indexDiff);
  const requestedObjectEntries = collectRequestedObjectEntries(indexDiff);
  const requestedLocalNodes = requestedLocalObjectIds.length > 0
    ? await localSource.loadSyncNodes(requestedLocalObjectIds)
    : [];
  const requestedLocalSyncObjects = await loadGenericObjects(localSource, requestedObjectEntries);
  const appliedLocalObjectIds = await applyObjectBatch(remoteRuntime, requestedLocalSyncObjects);
  const execution = requestedLocalNodes.length > 0
    ? await planAndExecuteSyncNodesFromRemote(remoteRuntime, remoteIndex, requestedLocalNodes)
    : createEmptyExecutionResult();

  return {
    appliedLocalObjectIds,
    execution,
    indexDiff,
    localIndex,
    pendingPullObjectIds: indexDiff.pushCandidates.map((entry) => entry.object_id),
    remoteIndex,
    requestedLocalNodes,
    requestedLocalObjectIds,
    requestedLocalSyncObjects
  };
}

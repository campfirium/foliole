import { hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts';
import type { EditorAnnotationOperationEntry } from '../features/editor/model/editorOperationHistory';

import { hasUnconfirmedNodeContent, hasUnconfirmedNodeReveal } from './workspaceNodeContentVersionGuard';
import { hasWorkspaceNodeMutationRuntime, syncRestoreNodesToRuntime, syncSoftDeleteNodesToRuntime } from './workspaceRuntimeSync';
import { drainPendingNodeContentRuntimePersist } from './workspaceStoreContentRuntimePersist';
import type { WorkspaceState } from './workspaceStoreTypes';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';
import { createTrashParentUpdates } from './workspaceTrashRuntimeCommit';

type Entry = EditorAnnotationOperationEntry;
export function annotationParentStates(snapshot: WorkspaceState, mutation: NonNullable<ReturnType<typeof computeDeleteNodesMutation>>) {
  return mutation.parentNodesToSync.map(node => ({ nodeId: node.id,
    before: structuredClone(snapshot.nodesById[node.id]?.imageRegions ?? null), after: structuredClone(node.imageRegions ?? null) }));
}
function exactSet(expected: string[], actual: string[]) {
  return expected.length === actual.length && new Set(actual).size === actual.length && expected.every(id => actual.includes(id));
}
export async function prepareAnnotationTargets(entry: Entry, snapshot: WorkspaceState, get: () => WorkspaceState) {
  const ids = entry.annotations.map(node => node.nodeId);
  if (!await Promise.all(ids.map(id => drainPendingNodeContentRuntimePersist(id))).then(results => results.every(Boolean))) return false;
  return snapshot.libraryScope === get().libraryScope && !ids.some(id => hasUnconfirmedNodeContent(id) || hasUnconfirmedNodeReveal(id));
}

export async function commitAnnotationDelete(entry: Entry, snapshot: WorkspaceState, get: () => WorkspaceState, beforeSubmit: () => boolean = () => true) {
  const native = hasWorkspaceNodeMutationRuntime();
  if (native && (!entry.historyFacts || !await prepareAnnotationTargets(entry, snapshot, get))) return null;
  const state = get();
  const mutation = computeDeleteNodesMutation(state, entry.annotations.map(node => node.nodeId));
  if (!mutation) return null;
  const parents = annotationParentStates(state, mutation);
  if (!beforeSubmit()) return null;
  const result = await syncSoftDeleteNodesToRuntime({ deletedAt: mutation.deletedAt, nodeIds: mutation.nodeIds,
    ...createTrashParentUpdates(mutation.parentNodesToSync),
    ...(native ? { annotationHistory: { mode: 'replay' as const, nodes: entry.historyFacts!, expectedDeletedAt: null,
      parents: parents.map(parent => ({ nodeId: parent.nodeId, imageRegionsHash: hashAnnotationValue(parent.before) })) } } : {}) });
  const deletedNodeIds = result?.deletedNodeIds ?? (!native ? mutation.nodeIds : []);
  return exactSet(mutation.nodeIds, deletedNodeIds) ? { deletedNodeIds, mutation,
    entry: { ...entry, historyDeletedAt: mutation.deletedAt, historyParents: parents } } : null;
}

export async function commitAnnotationRestore(entry: Entry, get: () => WorkspaceState, beforeSubmit: () => boolean = () => true) {
  const nodeIds = entry.annotations.map(node => node.nodeId);
  const native = hasWorkspaceNodeMutationRuntime();
  if (native && (!entry.historyFacts || !entry.historyDeletedAt)) return null;
  const parents = entry.historyParents ?? [];
  if (native && parents.some(parent => !get().nodesById[parent.nodeId]
    || hashAnnotationValue(get().nodesById[parent.nodeId]!.imageRegions) !== hashAnnotationValue(parent.after))) return null;
  if (!beforeSubmit()) return null;
  const result = await syncRestoreNodesToRuntime({ nodeIds,
    ...(parents.length ? { parentUpdates: parents.map(parent => ({ nodeId: parent.nodeId,
      imageRegions: parent.before, updatedAt: new Date().toISOString() })) } : {}),
    ...(native ? { annotationHistory: { mode: 'replay' as const, nodes: entry.historyFacts!, expectedDeletedAt: entry.historyDeletedAt!,
      parents: parents.map(parent => ({ nodeId: parent.nodeId, imageRegionsHash: hashAnnotationValue(parent.after) })) } } : {}) });
  const restoredNodeIds = result?.restoredNodeIds ?? (!native ? nodeIds : []);
  return exactSet(nodeIds, restoredNodeIds) ? restoredNodeIds : null;
}

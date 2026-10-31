import { hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts';
import { pushEditorOperationEntry, removeEditorOperationEntry, type EditorAnnotationOperationEntry } from '../features/editor/model/editorOperationHistory';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { confirmPendingEditorAnnotationEntry, isSameEditorAnnotationEntry } from './workspaceEditorAnnotationCreationSettlement';
import { createEditorAnnotationDeleteEntry } from './workspaceEditorAnnotationOperationEntry';
import { annotationParentStates, prepareAnnotationTargets } from './workspaceEditorAnnotationTrash';
import { hasWorkspaceNodeMutationRuntime, syncSoftDeleteNodesToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStoreTypes';
import { computeDeleteNodesMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';
import { createTrashParentUpdates } from './workspaceTrashRuntimeCommit';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;
type Prepared = { entry: EditorAnnotationOperationEntry; mutation: DeleteNodeMutationResult;
  parents: NonNullable<EditorAnnotationOperationEntry['historyParents']> };

function prepareDeletion(set: WorkspaceSet, nodeIds: string[]): Prepared | undefined {
  let prepared: Prepared | undefined;
  set(state => {
    const mutation = computeDeleteNodesMutation(state, nodeIds);
    const created = mutation && createEditorAnnotationDeleteEntry(state, mutation.nodeIds);
    if (!mutation || !created) return state;
    const entry = { ...created, canonical: 'pending' as const };
    prepared = { entry, mutation, parents: annotationParentStates(state, mutation) };
    return { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry) };
  });
  return prepared;
}

async function commitDeletion(prepared: Prepared, scope: WorkspaceState, get: () => WorkspaceState) {
  const { entry, mutation, parents } = prepared;
  const native = hasWorkspaceNodeMutationRuntime();
  if (native && !await prepareAnnotationTargets(entry, scope, get)) return undefined;
  return syncSoftDeleteNodesToRuntime({ deletedAt: mutation.deletedAt, nodeIds: mutation.nodeIds,
    ...createTrashParentUpdates(mutation.parentNodesToSync),
    ...(native ? { annotationHistory: { mode: 'capture' as const, expectedDeletedAt: null,
      parents: parents.map(parent => ({ nodeId: parent.nodeId, imageRegionsHash: hashAnnotationValue(parent.before) })) } } : {}) });
}

export function deleteEditorAnnotations(
  write: WorkspaceSet, get: () => WorkspaceState, nodeIds: string[],
  onSettled: (nodeId: string, canContinue: boolean) => void
) {
  const scope = get();
  const set: WorkspaceSet = patch => { if (get().libraryScope === scope.libraryScope) write(patch); };
  const prepared = prepareDeletion(set, nodeIds);
  if (!prepared) return;
  const { entry, mutation: submitted, parents } = prepared;
  const ids = submitted.nodeIds;
  const fail = () => {
    if (get().libraryScope === scope.libraryScope) showAppRuntimeNotice('The item could not be deleted.', 'error');
    set(state => ({ editorOperationHistory: removeEditorOperationEntry(state.editorOperationHistory, entry.nodeId,
      item => isSameEditorAnnotationEntry(item, ids, 'annotation.delete')) }));
    onSettled(entry.nodeId, false);
  };
  void commitDeletion(prepared, scope, get).then(result => {
    const accepted = result?.deletedNodeIds ?? (!hasWorkspaceNodeMutationRuntime() ? ids : []);
    if (accepted.length !== ids.length || new Set(accepted).size !== ids.length || ids.some(id => !accepted.includes(id))) return fail();
    let canContinue = false;
    set(state => {
      const mutation = computeDeleteNodesMutation(state, accepted, submitted.deletedAt, 'receipt');
      const confirmed = confirmPendingEditorAnnotationEntry(state, entry.nodeId, ids, {
        ...(result?.annotationHistory ? { historyFacts: result.annotationHistory.nodes } : {}),
        historyDeletedAt: submitted.deletedAt, historyParents: parents
      });
      if (!mutation) return state;
      canContinue = confirmed?.wasTop ?? false;
      for (const parent of parents) {
        const current = state.nodesById[parent.nodeId];
        if (current && hashAnnotationValue(current.imageRegions) !== hashAnnotationValue(parent.before)) mutation.patch.nodesById[parent.nodeId] = current;
      }
      return { ...mutation.patch, editorOperationHistory: confirmed?.history ?? state.editorOperationHistory };
    });
    if (get().libraryScope === scope.libraryScope) onSettled(entry.nodeId, canContinue);
  }).catch(fail);
}

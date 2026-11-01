import { hashAnnotationValue } from '../../lib/core/nodes/annotationHistoryFacts';
import { pushEditorOperationEntry, removeEditorOperationEntry } from '../features/editor/model/editorOperationHistory';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { createWorkspaceActionHistoryEntryId } from './workspaceActionHistoryEntry';
import { admitApplicationAction, settleApplicationAction } from './workspaceApplicationActionAdmission';
import { applyWorkspaceDeleteHistory } from './workspaceDeleteHistoryApply';
import { createWorkspaceDeleteHistoryEntry } from './workspaceDeleteHistoryEntry';
import { confirmPendingEditorAnnotationEntry } from './workspaceEditorAnnotationCreationSettlement';
import { commitAnnotationRestore } from './workspaceEditorAnnotationTrash';
import { collectNodeSubtreeIds } from './workspaceHelpers';
import type { WorkspaceRestoreHistoryEntry } from './workspaceRestoreHistory';
import type { WorkspaceState } from './workspaceStoreTypes';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';
import { collectTrashRootActionTargets } from './workspaceTrashMutationTargets';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export async function restoreApplicationNode(set: Set, get: () => WorkspaceState, requestedId: string) {
  const before = get();
  const rootNodeId = collectTrashRootActionTargets(before, [requestedId])[0];
  const owner = before.appActionHistory.application;
  if (!rootNodeId || !owner) return null;
  const nodeIds = collectNodeSubtreeIds(rootNodeId, before.nodesById).filter(id => before.trashedNodeIds.includes(id));
  const source = [...owner.undo, ...owner.redo].findLast(operation => operation.domain === 'editor' && operation.entry.type !== 'text.edit'
    && operation.entry.historyDeletedAt && operation.entry.annotations.some(value => value.nodeId === rootNodeId));
  const current = () => get().appActionHistory.application?.sessionId === owner.sessionId;
  if (source?.domain === 'editor' && source.entry.type !== 'text.edit') {
    const original = source.entry;
    let admissionId = '';
    set(state => {
      const history = pushEditorOperationEntry(state.editorOperationHistory, { ...original, type: 'annotation.create',
        title: 'Create Annotation', canonical: 'pending' });
      admissionId = history.application!.undo.at(-1)!.id;
      return { editorOperationHistory: history };
    });
    try {
      const restored = await commitAnnotationRestore(original, get, current);
      if (!restored) throw new Error('restore_not_committed');
      if (current()) set(state => {
        const deleted = { ...state.trashedNodeDeletedAtById };
        restored.forEach(id => delete deleted[id]);
        const nodesById = { ...state.nodesById };
        for (const parent of original.historyParents ?? []) {
          const node = nodesById[parent.nodeId];
          if (node && hashAnnotationValue(node.imageRegions) === hashAnnotationValue(parent.after)) nodesById[parent.nodeId] = { ...node, imageRegions: parent.before };
        }
        return { nodesById, trashedNodeIds: state.trashedNodeIds.filter(id => !restored.includes(id)),
          trashedNodeDeletedAtById: deleted, editorOperationHistory:
            confirmPendingEditorAnnotationEntry(state, original.nodeId, original.annotations.map(value => value.nodeId))?.history ?? state.editorOperationHistory };
      });
      return rootNodeId;
    } catch {
      if (current()) set(state => ({ editorOperationHistory: removeEditorOperationEntry(state.editorOperationHistory,
        original.nodeId, entry => entry.applicationOperationId === admissionId) }));
      showAppRuntimeNotice('The item could not be restored.', 'error');
      return null;
    }
  }
  return restoreWorkspaceNode(set, get, before, rootNodeId, nodeIds, current);
}

async function restoreWorkspaceNode(set: Set, get: () => WorkspaceState, before: WorkspaceState, rootNodeId: string, nodeIds: string[], current: () => boolean) {
  const owner = before.appActionHistory.application!;
  const existing = owner.undo.findLast(operation => operation.domain === 'workspace' && operation.entry.type === 'workspace.delete'
    && operation.entry.nodeIds.includes(rootNodeId));
  const live = { ...before, trashedNodeIds: before.trashedNodeIds.filter(id => !nodeIds.includes(id)),
    trashedNodeDeletedAtById: Object.fromEntries(Object.entries(before.trashedNodeDeletedAtById).filter(([id]) => !nodeIds.includes(id))) };
  const mutation = computeDeleteNodesMutation(live, nodeIds, before.trashedNodeDeletedAtById[rootNodeId]);
  if (!mutation) return null;
  const deletion = existing?.domain === 'workspace' && existing.entry.type === 'workspace.delete' ? existing.entry
    : createWorkspaceDeleteHistoryEntry({ beforeState: live, afterState: before, kind: before.nodesById[rootNodeId]!.kind, mutation, rootNodeId });
  const entry: WorkspaceRestoreHistoryEntry = { id: createWorkspaceActionHistoryEntryId(), title: 'Restore Item', type: 'workspace.restore', deletion };
  admitApplicationAction(set, entry);
  try {
    const result = await applyWorkspaceDeleteHistory({ entry: deletion, get, mode: 'undo', mutationTimestamp: new Date().toISOString() });
    if (result.status !== 'applied' || result.entry.type !== 'workspace.delete') throw new Error('restore_not_committed');
    if (current()) set(state => ({ ...result.patch, ...settleApplicationAction(state, entry.id, { ...entry, deletion: result.entry as typeof deletion }) }));
    return rootNodeId;
  } catch {
    if (current()) set(state => settleApplicationAction(state, entry.id, null));
    showAppRuntimeNotice('The item could not be restored.', 'error');
    return null;
  }
}

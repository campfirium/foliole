import {
  applyEditorOperationHistory,
  pushEditorOperationEntry,
  type EditorOperationHistoryEntry,
  type EditorTextEditOperationEntry
} from '../features/editor/model/editorOperationHistory';

import { createEditorAnnotationDeleteEntry } from './workspaceEditorAnnotationOperationEntry';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import {
  syncNodeContentToRuntime,
  syncRestoreNodesToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { computeDeleteNodesMutation, type DeleteNodeMutationResult } from './workspaceTrashMutations';

type WorkspaceSet = (
  partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;
type WorkspaceGet = () => WorkspaceState;

function syncSoftDeleteMutation(mutation: DeleteNodeMutationResult | null) {
  if (!mutation || mutation.nodeIds.length === 0) {
    return;
  }
  for (const parentNode of mutation.parentNodesToSync) {
    syncNodeContentToRuntime(parentNode);
  }
  syncSoftDeleteNodesToRuntime({
    deletedAt: mutation.deletedAt,
    nodeIds: mutation.nodeIds
  });
}

function softDeleteEditorAnnotationNodes(
  set: WorkspaceSet,
  nodeIds: string[],
  recordOperation: boolean
) {
  let mutation: DeleteNodeMutationResult | null = null;
  set((state) => {
    mutation = computeDeleteNodesMutation(state, nodeIds);
    if (!mutation) {
      return state;
    }
    const entry = recordOperation ? createEditorAnnotationDeleteEntry(state, mutation.nodeIds) : null;
    return {
      ...mutation.patch,
      ...(entry
        ? { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry) }
        : {})
    };
  });
  syncSoftDeleteMutation(mutation);
  return Boolean(mutation);
}

function restoreEditorAnnotationNodes(set: WorkspaceSet, nodeIds: string[], targetNodeId: string) {
  const idsToRestore = nodeIds.filter(Boolean);
  if (idsToRestore.length === 0) {
    return false;
  }
  void syncRestoreNodesToRuntime({ nodeIds: idsToRestore });
  set((state) => {
    const restoredNodeIds = new Set(idsToRestore);
    const nextTrashedNodeIds = state.trashedNodeIds.filter((nodeId) => !restoredNodeIds.has(nodeId));
    const nextTrashedNodeDeletedAtById = { ...state.trashedNodeDeletedAtById };
    idsToRestore.forEach((nodeId) => {
      delete nextTrashedNodeDeletedAtById[nodeId];
    });
    const nextState = {
      ...state,
      activeNodeId: targetNodeId,
      trashedNodeDeletedAtById: nextTrashedNodeDeletedAtById,
      trashedNodeIds: nextTrashedNodeIds
    };
    return {
      activeNodeId: targetNodeId,
      reviewSession: reconcileReviewSession(nextState, targetNodeId),
      trashedNodeDeletedAtById: nextTrashedNodeDeletedAtById,
      trashedNodeIds: nextTrashedNodeIds
    };
  });
  return true;
}

function resolveTextEditApply(entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo') {
  return mode === 'undo'
    ? { expectedContent: entry.afterContent, nextContent: entry.beforeContent }
    : { expectedContent: entry.beforeContent, nextContent: entry.afterContent };
}

function applyTextEditOperation(
  snapshot: WorkspaceState,
  entry: EditorTextEditOperationEntry,
  mode: 'redo' | 'undo'
) {
  const node = snapshot.nodesById[entry.nodeId];
  const { expectedContent, nextContent } = resolveTextEditApply(entry, mode);
  if (!node || snapshot.trashedNodeIds.includes(entry.nodeId) || node.content !== expectedContent) {
    return false;
  }
  snapshot.updateNodeContent(entry.nodeId, nextContent);
  return true;
}

function applyEditorOperationEntry(
  set: WorkspaceSet,
  snapshot: WorkspaceState,
  entry: EditorOperationHistoryEntry,
  mode: 'redo' | 'undo'
) {
  if (entry.type === 'text.edit') {
    return applyTextEditOperation(snapshot, entry, mode);
  }
  const nodeIds = entry.annotations.map((annotation) => annotation.nodeId);
  if (entry.type === 'annotation.create') {
    return mode === 'undo'
      ? softDeleteEditorAnnotationNodes(set, nodeIds, false)
      : restoreEditorAnnotationNodes(set, nodeIds, entry.nodeId);
  }
  if (entry.type === 'annotation.delete') {
    return mode === 'undo'
      ? restoreEditorAnnotationNodes(set, nodeIds, entry.nodeId)
      : softDeleteEditorAnnotationNodes(set, nodeIds, false);
  }
  return false;
}

function createApplyEditorOperationAction(
  set: WorkspaceSet,
  get: WorkspaceGet,
  mode: 'redo' | 'undo'
) {
  return () => {
    const snapshot = get();
    const result = applyEditorOperationHistory({
      applyEntry: (entry, applyMode) => applyEditorOperationEntry(set, snapshot, entry, applyMode),
      currentNodeId: snapshot.activeNodeId,
      history: snapshot.editorOperationHistory,
      mode
    });
    if (!result.applied) {
      return false;
    }
    set({ editorOperationHistory: result.history });
    return true;
  };
}

export function createWorkspaceEditorOperationHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  return {
    deleteEditorAnnotationNodes: (nodeIds: string[]) => {
      softDeleteEditorAnnotationNodes(set, nodeIds, true);
    },
    pushEditorOperationEntry: (entry: EditorOperationHistoryEntry) => {
      set((state) => ({
        editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry)
      }));
    },
    redoEditorOperation: createApplyEditorOperationAction(set, get, 'redo'),
    undoEditorOperation: createApplyEditorOperationAction(set, get, 'undo')
  };
}

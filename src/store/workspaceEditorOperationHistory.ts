import {
  getEditorOperationTopEntry,
  invalidateEditorOperationSession,
  moveEditorOperationEntry,
  pushEditorOperationEntry,
  removeEditorOperationEntry,
  replaceEditorOperationEntry,
  type EditorAnnotationOperationEntry,
  type EditorOperationHistoryEntry
} from '../features/editor/model/editorOperationHistory';

import {
  confirmPendingEditorAnnotationEntry,
  isSameEditorAnnotationEntry,
  settleEditorAnnotationCreation
} from './workspaceEditorAnnotationCreationSettlement';
import { startEditorAnnotationHistoryMutation } from './workspaceEditorAnnotationHistoryMutation';
import { createEditorAnnotationDeleteEntry } from './workspaceEditorAnnotationOperationEntry';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentToRuntime,
  syncSoftDeleteNodesToRuntime
} from './workspaceRuntimeSync';
import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';
import { computeDeleteNodesMutation } from './workspaceTrashMutations';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;
type WorkspaceGet = () => WorkspaceState;

function expectedTextContent(entry: Extract<EditorOperationHistoryEntry, { type: 'text.edit' }>, mode: 'redo' | 'undo') {
  return mode === 'undo' ? entry.afterContent : entry.beforeContent;
}

function applyTextEntry(args: {
  context?: EditorOperationApplyContext;
  entry: Extract<EditorOperationHistoryEntry, { type: 'text.edit' }>;
  mode: 'redo' | 'undo';
  nodeId: string;
  set: WorkspaceSet;
}) {
  if (!args.context || args.context.nodeId !== args.nodeId || args.context.currentContent !== expectedTextContent(args.entry, args.mode)) {
    args.set((state) => ({
      editorOperationHistory: invalidateEditorOperationSession(state.editorOperationHistory, {
        nodeId: args.nodeId,
        reason: 'current-content-mismatch'
      })
    }));
    return false;
  }
  if (!args.context.applyText(args.entry, args.mode)) {
    args.set((state) => ({
      editorOperationHistory: invalidateEditorOperationSession(state.editorOperationHistory, {
        nodeId: args.nodeId,
        reason: 'text-replay-failed'
      })
    }));
    return false;
  }
  args.set((state) => ({
    editorOperationHistory: moveEditorOperationEntry(state.editorOperationHistory, args.nodeId, args.mode)
  }));
  return true;
}

function createApplyForNode(set: WorkspaceSet, get: WorkspaceGet) {
  return (nodeId: string, mode: 'redo' | 'undo', context?: EditorOperationApplyContext) => {
    const entry = getEditorOperationTopEntry(get().editorOperationHistory, nodeId, mode);
    if (!entry) return false;
    if (entry.type === 'text.edit') return applyTextEntry({
      entry,
      mode,
      nodeId,
      set,
      ...(context ? { context } : {})
    });
    if (entry.applyingMode) return false;
    if (entry.canonical === 'pending') {
      if (mode !== 'undo') return false;
      set((state) => ({
        editorOperationHistory: replaceEditorOperationEntry(state.editorOperationHistory, nodeId, mode, {
          ...entry,
          queuedMode: mode
        })
      }));
      return true;
    }
    return startEditorAnnotationHistoryMutation({ entry, get, mode, set });
  };
}

function deleteEditorAnnotations(set: WorkspaceSet, get: WorkspaceGet, nodeIds: string[]) {
  let entry: EditorAnnotationOperationEntry | null = null;
  let deletedAt = '';
  set((state) => {
    const created = createEditorAnnotationDeleteEntry(state, nodeIds);
    const mutation = computeDeleteNodesMutation(state, nodeIds);
    if (!created || !mutation) return state;
    entry = { ...created, canonical: 'pending' };
    deletedAt = mutation.deletedAt;
    return { editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry) };
  });
  if (!entry) return;
  void Promise.resolve(syncSoftDeleteNodesToRuntime({ deletedAt, nodeIds })).then((result) => {
    const acceptedIds = result?.deletedNodeIds ?? (!hasWorkspaceNodeMutationRuntime() ? nodeIds : []);
    let queuedMode: 'redo' | 'undo' | undefined;
    set((state) => {
      const acceptedIdSet = new Set(acceptedIds);
      if (acceptedIds.length !== nodeIds.length || nodeIds.some((id) => !acceptedIdSet.has(id))) {
        return {
          editorOperationHistory: removeEditorOperationEntry(
            state.editorOperationHistory,
            entry!.nodeId,
            (item) => isSameEditorAnnotationEntry(item, nodeIds, 'annotation.delete')
          )
        };
      }
      const mutation = computeDeleteNodesMutation(state, acceptedIds, deletedAt);
      const confirmed = confirmPendingEditorAnnotationEntry(state, entry!.nodeId, nodeIds);
      if (!mutation || !confirmed) return state;
      queuedMode = confirmed.queuedMode;
      mutation.parentNodesToSync.forEach(syncNodeContentToRuntime);
      return {
        nodesById: mutation.patch.nodesById,
        reviewSession: mutation.patch.reviewSession,
        trashedNodeDeletedAtById: mutation.patch.trashedNodeDeletedAtById,
        trashedNodeIds: mutation.patch.trashedNodeIds,
        editorOperationHistory: confirmed.history
      };
    });
    if (queuedMode) queueMicrotask(() => createApplyForNode(set, get)(entry!.nodeId, queuedMode!));
  }).catch(() => {
    set((state) => ({
      editorOperationHistory: removeEditorOperationEntry(
        state.editorOperationHistory,
        entry!.nodeId,
        (item) => isSameEditorAnnotationEntry(item, nodeIds, 'annotation.delete')
      )
    }));
  });
}

export function createWorkspaceEditorOperationHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  const applyForNode = createApplyForNode(set, get);
  return {
    deleteEditorAnnotationNodes: (nodeIds: string[]) => deleteEditorAnnotations(set, get, nodeIds),
    pushEditorOperationEntry: (entry: EditorOperationHistoryEntry) => set((state) => ({
      editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry)
    })),
    redoEditorOperation: (context?: EditorOperationApplyContext) => {
      const nodeId = context?.nodeId ?? get().activeNodeId;
      return nodeId ? applyForNode(nodeId, 'redo', context) : false;
    },
    settleEditorAnnotationCreation: (result: { annotationNodeIds: string[]; nodeId: string; succeeded: boolean }) => {
      const queuedMode = settleEditorAnnotationCreation(set, result);
      if (queuedMode) queueMicrotask(() => applyForNode(result.nodeId, queuedMode));
    },
    undoEditorOperation: (context?: EditorOperationApplyContext) => {
      const nodeId = context?.nodeId ?? get().activeNodeId;
      return nodeId ? applyForNode(nodeId, 'undo', context) : false;
    }
  };
}

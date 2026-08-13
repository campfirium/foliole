import {
  getEditorOperationTopEntry,
  invalidateEditorOperationSession,
  isPendingEditorAnnotationEntry,
  moveEditorOperationEntry,
  pushEditorOperationEntry,
  removeEditorOperationEntry,
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
type EditorOperationMode = 'redo' | 'undo';
type ApplyOutcome = 'applied' | 'failed' | 'noop' | 'pending';

interface QueuedEditorOperation {
  context?: EditorOperationApplyContext;
  mode: EditorOperationMode;
}

const EDITOR_OPERATION_QUEUE_LIMIT = 50;

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
  const currentContent = args.context?.getCurrentContent?.() ?? args.context?.currentContent;
  if (!args.context || args.context.nodeId !== args.nodeId || currentContent !== expectedTextContent(args.entry, args.mode)) {
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

function hasBlockingAnnotation(get: WorkspaceGet, nodeId: string) {
  return (['undo', 'redo'] as const).some((mode) => isPendingEditorAnnotationEntry(
    getEditorOperationTopEntry(get().editorOperationHistory, nodeId, mode)
  ));
}

function createOperationRunner(set: WorkspaceSet, get: WorkspaceGet) {
  const queuedByNodeId = new Map<string, QueuedEditorOperation[]>();
  const clearQueued = (nodeId: string) => queuedByNodeId.delete(nodeId);
  const enqueue = (nodeId: string, command: QueuedEditorOperation) => {
    const queued = queuedByNodeId.get(nodeId) ?? [];
    if (queued.length >= EDITOR_OPERATION_QUEUE_LIMIT) return false;
    queuedByNodeId.set(nodeId, [...queued, command]);
    return true;
  };
  let applyForNode: (
    nodeId: string,
    mode: EditorOperationMode,
    context?: EditorOperationApplyContext,
    queueWhenBlocked?: boolean
  ) => ApplyOutcome;
  const drain = (nodeId: string) => {
    const queued = queuedByNodeId.get(nodeId);
    if (!queued || queued.length === 0) return clearQueued(nodeId);
    const next = queued.shift()!;
    if (queued.length === 0) clearQueued(nodeId);
    const outcome = applyForNode(nodeId, next.mode, next.context, false);
    if (outcome === 'applied' || outcome === 'noop') queueMicrotask(() => drain(nodeId));
    else if (outcome === 'failed') clearQueued(nodeId);
  };
  const settle = (nodeId: string, succeeded: boolean) => {
    if (!succeeded) return clearQueued(nodeId);
    queueMicrotask(() => drain(nodeId));
  };
  applyForNode = (nodeId, mode, context, queueWhenBlocked = true) => {
    if (hasBlockingAnnotation(get, nodeId)) {
      return queueWhenBlocked && enqueue(nodeId, { ...(context ? { context } : {}), mode })
        ? 'pending'
        : 'failed';
    }
    const entry = getEditorOperationTopEntry(get().editorOperationHistory, nodeId, mode);
    if (!entry) return 'noop';
    if (entry.type === 'text.edit') {
      return applyTextEntry({ entry, mode, nodeId, set, ...(context ? { context } : {}) })
        ? 'applied'
        : 'failed';
    }
    startEditorAnnotationHistoryMutation({
      entry,
      get,
      mode,
      onSettled: (succeeded) => settle(nodeId, succeeded),
      set
    });
    return 'pending';
  };
  return {
    apply: (nodeId: string, mode: EditorOperationMode, context?: EditorOperationApplyContext) =>
      ['applied', 'pending'].includes(applyForNode(nodeId, mode, context)),
    settle
  };
}

function deleteEditorAnnotations(
  set: WorkspaceSet,
  nodeIds: string[],
  onSettled: (nodeId: string, succeeded: boolean) => void
) {
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
    let settledExactly = false;
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
      settledExactly = confirmed.wasTop;
      mutation.parentNodesToSync.forEach(syncNodeContentToRuntime);
      return {
        nodesById: mutation.patch.nodesById,
        reviewSession: mutation.patch.reviewSession,
        trashedNodeDeletedAtById: mutation.patch.trashedNodeDeletedAtById,
        trashedNodeIds: mutation.patch.trashedNodeIds,
        editorOperationHistory: confirmed.history
      };
    });
    onSettled(entry!.nodeId, settledExactly);
  }).catch(() => {
    set((state) => ({
      editorOperationHistory: removeEditorOperationEntry(
        state.editorOperationHistory,
        entry!.nodeId,
        (item) => isSameEditorAnnotationEntry(item, nodeIds, 'annotation.delete')
      )
    }));
    onSettled(entry!.nodeId, false);
  });
}

export function createWorkspaceEditorOperationHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  const runner = createOperationRunner(set, get);
  return {
    deleteEditorAnnotationNodes: (nodeIds: string[]) => deleteEditorAnnotations(
      set,
      nodeIds,
      (nodeId, succeeded) => runner.settle(nodeId, succeeded)
    ),
    pushEditorOperationEntry: (entry: EditorOperationHistoryEntry) => set((state) => ({
      editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry)
    })),
    redoEditorOperation: (context?: EditorOperationApplyContext) => {
      const nodeId = context?.nodeId ?? get().activeNodeId;
      return nodeId ? runner.apply(nodeId, 'redo', context) : false;
    },
    settleEditorAnnotationCreation: (result: { annotationNodeIds: string[]; nodeId: string; succeeded: boolean }) => {
      const outcome = settleEditorAnnotationCreation(set, result);
      if (outcome !== 'confirmed-nontop') {
        runner.settle(result.nodeId, outcome === 'confirmed-top');
      }
    },
    undoEditorOperation: (context?: EditorOperationApplyContext) => {
      const nodeId = context?.nodeId ?? get().activeNodeId;
      return nodeId ? runner.apply(nodeId, 'undo', context) : false;
    }
  };
}

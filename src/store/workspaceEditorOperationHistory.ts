import {
  getEditorOperationTopEntry,
  isPendingEditorAnnotationEntry,
  pushEditorOperationEntry,
  type EditorOperationHistoryInput
} from '../features/editor/model/editorOperationHistory';

import {
  settleEditorAnnotationCreation
} from './workspaceEditorAnnotationCreationSettlement';
import { deleteEditorAnnotations } from './workspaceEditorAnnotationDelete';
import { startEditorAnnotationHistoryMutation } from './workspaceEditorAnnotationHistoryMutation';
import { createPendingEditorTextReplays } from './workspaceEditorTextReplayPending';
import type { EditorOperationApplyContext, WorkspaceState } from './workspaceStoreTypes';

type WorkspaceSet = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;
type WorkspaceGet = () => WorkspaceState;
type EditorOperationMode = 'redo' | 'undo';
type ApplyOutcome = 'applied' | 'blocked' | 'failed' | 'noop' | 'pending';

interface QueuedEditorOperation {
  context?: EditorOperationApplyContext;
  mode: EditorOperationMode;
}

const EDITOR_OPERATION_QUEUE_LIMIT = 50;

function hasBlockingAnnotation(get: WorkspaceGet, nodeId: string) {
  return (['undo', 'redo'] as const).some((mode) => isPendingEditorAnnotationEntry(
    getEditorOperationTopEntry(get().editorOperationHistory, nodeId, mode)
  ));
}

function resolveOperationTarget(
  state: WorkspaceState,
  requestedNodeId: string,
  mode: EditorOperationMode
) {
  if (getEditorOperationTopEntry(state.editorOperationHistory, requestedNodeId, mode)) {
    return requestedNodeId;
  }
  const node = state.nodesById[requestedNodeId];
  const parentNodeId = node?.anchorLink?.kind === 'image-excerpt' ? node.parentNodeId : null;
  const parentEntry = getEditorOperationTopEntry(state.editorOperationHistory, parentNodeId, mode);
  return parentEntry && parentEntry.type !== 'text.edit' && parentNodeId ? parentNodeId : requestedNodeId;
}

function createQueueScopeGuard(get: WorkspaceGet, queuedByNodeId: Map<string, QueuedEditorOperation[]>) {
  let libraryScope: WorkspaceState['libraryScope'];
  return () => {
    if (get().libraryScope === libraryScope) return;
    queuedByNodeId.clear();
    libraryScope = get().libraryScope;
  };
}

function createOperationRunner(set: WorkspaceSet, get: WorkspaceGet) {
  const queuedByNodeId = new Map<string, QueuedEditorOperation[]>();
  const checkScope = createQueueScopeGuard(get, queuedByNodeId);
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
    checkScope();
    const queued = queuedByNodeId.get(nodeId);
    if (!queued || queued.length === 0) return clearQueued(nodeId);
    const next = queued[0]!;
    const outcome = applyForNode(nodeId, next.mode, next.context, false);
    if (outcome === 'blocked') return;
    queued.shift();
    if (queued.length === 0) clearQueued(nodeId);
    if (outcome === 'applied' || outcome === 'noop') queueMicrotask(() => drain(nodeId));
    else if (outcome === 'failed') clearQueued(nodeId);
  };
  const settle = (nodeId: string, succeeded: boolean) => {
    if (!succeeded) return clearQueued(nodeId);
    queueMicrotask(() => drain(nodeId));
  };
  const textReplays = createPendingEditorTextReplays(get, settle);
  applyForNode = (nodeId, mode, context, queueWhenBlocked = true) => {
    checkScope();
    if (textReplays.has(nodeId) || hasBlockingAnnotation(get, nodeId)) {
      if (!queueWhenBlocked) return 'blocked';
      return enqueue(nodeId, { ...(context ? { context } : {}), mode }) ? 'pending' : 'failed';
    }
    const entry = getEditorOperationTopEntry(get().editorOperationHistory, nodeId, mode);
    if (!entry) return 'noop';
    if (entry.type === 'text.edit') {
      return textReplays.apply({ entry, mode, nodeId, set, ...(context ? { context } : {}) });
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

export function createWorkspaceEditorOperationHistoryActions(set: WorkspaceSet, get: WorkspaceGet) {
  const runner = createOperationRunner(set, get);
  return {
    deleteEditorAnnotationNodes: (nodeIds: string[]) => deleteEditorAnnotations(
      set,
      get,
      nodeIds,
      (nodeId, succeeded) => runner.settle(nodeId, succeeded)
    ),
    pushEditorOperationEntry: (entry: EditorOperationHistoryInput) => set((state) => ({
      editorOperationHistory: pushEditorOperationEntry(state.editorOperationHistory, entry)
    })),
    redoEditorOperation: (context?: EditorOperationApplyContext) => {
      if (get().appActionHistory.application) return get().redoApplicationOperation?.(context) ?? false;
      const requestedNodeId = context?.nodeId ?? get().activeNodeId;
      if (!requestedNodeId) return false;
      const nodeId = resolveOperationTarget(get(), requestedNodeId, 'redo');
      return runner.apply(nodeId, 'redo', nodeId === requestedNodeId ? context : undefined);
    },
    settleEditorAnnotationCreation: (result: { annotationNodeIds: string[]; nodeId: string; succeeded: boolean }) => {
      const outcome = settleEditorAnnotationCreation(set, result);
      if (outcome !== 'confirmed-nontop') {
        runner.settle(result.nodeId, outcome === 'confirmed-top');
      }
    },
    undoEditorOperation: (context?: EditorOperationApplyContext) => {
      if (get().appActionHistory.application) return get().undoApplicationOperation?.(context) ?? false;
      const requestedNodeId = context?.nodeId ?? get().activeNodeId;
      if (!requestedNodeId) return false;
      const nodeId = resolveOperationTarget(get(), requestedNodeId, 'undo');
      return runner.apply(nodeId, 'undo', nodeId === requestedNodeId ? context : undefined);
    }
  };
}

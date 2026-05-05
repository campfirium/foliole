import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { toRuntimeNodeViewStates } from '../../store/workspaceReadingProgress';
import type { NodeViewState } from '../../store/workspaceStore';
import { resolvePersistedViewStateSelection } from './persistedViewStateSelection';

export interface CapturedNodeViewState {
  nodeId: string;
  viewState: NodeViewState;
}

export interface ResolvedReadingProgressState {
  captured: CapturedNodeViewState | null;
  mergedNodeViewById: Record<string, NodeViewState | undefined>;
  resolvedActiveNodeId: string | null;
}

export interface PendingNodeViewStateMap {
  [nodeId: string]: NodeViewState | undefined;
}

export function normalizeNodeViewState(viewState: NodeViewState): NodeViewState {
  return {
    scrollTop: Math.max(0, Math.trunc(viewState.scrollTop)),
    selection: {
      from: Math.max(0, Math.trunc(viewState.selection.from)),
      to: Math.max(0, Math.trunc(viewState.selection.to))
    }
  };
}

export function isSameNodeViewState(left: NodeViewState | undefined, right: NodeViewState): boolean {
  if (!left) {
    return false;
  }
  return (
    left.scrollTop === right.scrollTop &&
    left.selection.from === right.selection.from &&
    left.selection.to === right.selection.to
  );
}

export function createReadingProgressSignature(
  activeNodeId: string | null,
  nodeViewById: Record<string, NodeViewState | undefined>
): string {
  return JSON.stringify({
    activeNodeId,
    nodeViewStates: toRuntimeNodeViewStates(nodeViewById)
  });
}

export function captureEditorNodeViewState(
  nodeId: string | null,
  getReadingPositionSelection: (() => { from: number; to: number } | null) | undefined,
  isImmersiveMode: boolean,
  isViewingTrashNode: boolean,
  editorRef: MutableRefObject<EditorAdapter | null>
): CapturedNodeViewState | null {
  if (isViewingTrashNode || !nodeId || !editorRef.current) {
    return null;
  }
  return {
    nodeId,
    viewState: normalizeNodeViewState({
      scrollTop: editorRef.current.getScrollTop(),
      selection: resolvePersistedViewStateSelection({
        editor: editorRef.current,
        isImmersiveMode,
        sharedReadingSelection: getReadingPositionSelection?.() ?? null
      })
    })
  };
}

export function createReadingProgressPayload(
  activeNodeId: string | null,
  nodeViewById: Record<string, NodeViewState | undefined>
) {
  return {
    activeNodeId,
    nodeViewStates: toRuntimeNodeViewStates(nodeViewById),
    updatedAt: new Date().toISOString()
  };
}

export function mergePendingNodeViewStates(
  nodeViewById: Record<string, NodeViewState | undefined>,
  pendingNodeViewById: PendingNodeViewStateMap
) {
  let mergedNodeViewById = nodeViewById;
  for (const [nodeId, viewState] of Object.entries(pendingNodeViewById)) {
    if (!viewState || isSameNodeViewState(mergedNodeViewById[nodeId], viewState)) {
      continue;
    }
    if (mergedNodeViewById === nodeViewById) {
      mergedNodeViewById = { ...nodeViewById };
    }
    mergedNodeViewById[nodeId] = viewState;
  }
  return mergedNodeViewById;
}

export function stagePendingNodeViewState(args: {
  captured: CapturedNodeViewState | null;
  nodeViewById: Record<string, NodeViewState | undefined>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
}) {
  if (!args.captured) {
    return false;
  }
  const previousPendingViewState = args.pendingNodeViewByIdRef.current[args.captured.nodeId];
  if (
    isSameNodeViewState(previousPendingViewState, args.captured.viewState) ||
    (isSameNodeViewState(args.nodeViewById[args.captured.nodeId], args.captured.viewState) && !previousPendingViewState)
  ) {
    return false;
  }
  args.pendingNodeViewByIdRef.current = {
    ...args.pendingNodeViewByIdRef.current,
    [args.captured.nodeId]: args.captured.viewState
  };
  return true;
}

export function updateCapturedNodeViewState(args: {
  captured: CapturedNodeViewState | null;
  nodeViewById: Record<string, NodeViewState | undefined>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  if (!args.captured || isSameNodeViewState(args.nodeViewById[args.captured.nodeId], args.captured.viewState)) {
    if (args.captured && args.pendingNodeViewByIdRef.current[args.captured.nodeId]) {
      const nextPendingNodeViewById = { ...args.pendingNodeViewByIdRef.current };
      delete nextPendingNodeViewById[args.captured.nodeId];
      args.pendingNodeViewByIdRef.current = nextPendingNodeViewById;
    }
    return;
  }
  args.setNodeViewState(args.captured.nodeId, args.captured.viewState);
  if (args.pendingNodeViewByIdRef.current[args.captured.nodeId]) {
    const nextPendingNodeViewById = { ...args.pendingNodeViewByIdRef.current };
    delete nextPendingNodeViewById[args.captured.nodeId];
    args.pendingNodeViewByIdRef.current = nextPendingNodeViewById;
  }
}

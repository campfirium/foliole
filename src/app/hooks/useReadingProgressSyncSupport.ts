import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { toRuntimeNodeViewStates } from '../../store/workspaceReadingProgress';
import type { NodeViewState } from '../../store/workspaceStore';

export interface CapturedNodeViewState {
  nodeId: string;
  viewState: NodeViewState;
}

export interface ResolvedReadingProgressState {
  captured: CapturedNodeViewState | null;
  mergedNodeViewById: Record<string, NodeViewState | undefined>;
  resolvedActiveNodeId: string | null;
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
  isViewingTrashNode: boolean,
  editorRef: MutableRefObject<EditorAdapter | null>
): CapturedNodeViewState | null {
  if (isViewingTrashNode || !nodeId || !editorRef.current) {
    return null;
  }
  const readingSelection = getReadingPositionSelection?.();
  return {
    nodeId,
    viewState: normalizeNodeViewState({
      scrollTop: editorRef.current.getScrollTop(),
      selection: readingSelection ?? editorRef.current.getSelection()
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

export function updateCapturedNodeViewState(args: {
  captured: CapturedNodeViewState | null;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  if (!args.captured || isSameNodeViewState(args.nodeViewById[args.captured.nodeId], args.captured.viewState)) {
    return;
  }
  args.setNodeViewState(args.captured.nodeId, args.captured.viewState);
}

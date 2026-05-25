import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeViewState } from '../../store/workspaceStore';

import {
  captureEditorNodeViewState,
  mergePendingNodeViewStates,
  resolveNodeViewIdsToPersist,
  type PendingNodeViewStateMap,
  type ReadingProgressCaptureMode,
  type ResolvedReadingProgressState
} from './useReadingProgressSyncSupport';

function resolveActiveNodeIdToPersist(args: {
  activeNodeIdOverride?: string | null;
  captureNodeIdOverride?: string | null;
  includePendingNodeViewStates: boolean;
  latestActiveNodeId: string | null;
}) {
  if (args.captureNodeIdOverride !== null || !args.includePendingNodeViewStates) {
    return null;
  }
  return args.activeNodeIdOverride ?? args.latestActiveNodeId;
}

export function resolveReadingProgressState(args: {
  activeNodeIdOverride?: string | null;
  activeNodeIdRef: MutableRefObject<string | null>;
  captureMode: ReadingProgressCaptureMode;
  captureNodeIdOverride?: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  includePendingNodeViewStates: boolean;
  isImmersiveMode: boolean;
  isViewingTrashNode: boolean;
  isWorkspaceHydratedRef: MutableRefObject<boolean>;
  nodeViewByIdRef: MutableRefObject<Record<string, NodeViewState | undefined>>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
}): ResolvedReadingProgressState | null {
  if (!args.isWorkspaceHydratedRef.current) {
    return null;
  }
  const captureNodeId =
    typeof args.captureNodeIdOverride === 'undefined'
      ? args.activeNodeIdRef.current
      : args.captureNodeIdOverride;
  const captured = args.captureNodeIdOverride !== null
    ? captureEditorNodeViewState(
        captureNodeId,
        args.getReadingPositionSelection,
        args.isImmersiveMode,
        args.isViewingTrashNode,
        args.editorRef,
        args.captureMode
      )
    : null;
  const mergedPendingNodeViewById = args.includePendingNodeViewStates
    ? mergePendingNodeViewStates(args.nodeViewByIdRef.current, args.pendingNodeViewByIdRef.current)
    : args.nodeViewByIdRef.current;
  return {
    captured,
    mergedNodeViewById: captured
      ? { ...mergedPendingNodeViewById, [captured.nodeId]: captured.viewState }
      : mergedPendingNodeViewById,
    nodeViewIdsToPersist: resolveNodeViewIdsToPersist({
      activeNodeIdToPersist: resolveActiveNodeIdToPersist({
        includePendingNodeViewStates: args.includePendingNodeViewStates,
        latestActiveNodeId: args.activeNodeIdRef.current,
        ...definedProps({
          activeNodeIdOverride: args.activeNodeIdOverride,
          captureNodeIdOverride: args.captureNodeIdOverride
        })
      }),
      captured,
      includePendingNodeViewStates: args.includePendingNodeViewStates,
      pendingNodeViewById: args.pendingNodeViewByIdRef.current
    }),
    resolvedActiveNodeId:
      typeof args.activeNodeIdOverride === 'undefined' ? args.activeNodeIdRef.current : args.activeNodeIdOverride
  };
}

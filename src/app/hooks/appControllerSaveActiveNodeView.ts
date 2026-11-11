import { useCallback } from 'react';

import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import type { NodeViewState } from '../../store/workspaceStore';

import { resolvePersistedViewStateSelection } from './persistedViewStateSelection';
import { useAppRuntime } from './useAppRuntime';

interface SaveActiveNodeViewWorkspaceState {
  activeNodeId: string | null;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

export function flushMovedReadingResume(runtime: ReturnType<typeof useAppRuntime>, nodeId: string) {
  if (runtime.readingResumeMovedNodeIdRef?.current !== nodeId ||
      runtime.readingResumeContextRef?.current?.nodeId !== nodeId) return;
  void window.__folioleFlushReadingProgressBeforeClose?.().catch(error =>
    logRuntimeWarning('reading position flush failed', { area: 'persistence', action: 'save_reading_jump', error })
  );
}

export function flushVisibleReadingJump(runtime: ReturnType<typeof useAppRuntime>, nodeId: string) {
  if (runtime.readingResumeMovedNodeIdRef?.current !== nodeId) return;
  const target = runtime.readingPositionRef.current;
  if (target.nodeId === nodeId && target.selection &&
      runtime.editorRef.current?.isPositionNearViewportRatio?.(target.selection.from, 0.5, 0.5)) {
    flushMovedReadingResume(runtime, nodeId);
  }
}

function resolveSelectionToPersist(
  runtime: ReturnType<typeof useAppRuntime>,
  nodeId: string
) {
  return resolvePersistedViewStateSelection({
    editor: runtime.editorRef.current,
    isImmersiveMode: runtime.isImmersiveMode,
    sharedReadingSelection:
      runtime.readingPositionRef.current.nodeId === nodeId ? runtime.readingPositionRef.current.selection : null
  });
}

export function useSaveActiveNodeView(
  runtime: ReturnType<typeof useAppRuntime>,
  ws: SaveActiveNodeViewWorkspaceState
) {
  return useCallback((nodeIdOverride?: string | null) => {
    const nodeId = nodeIdOverride ?? ws.activeNodeId;
    if (runtime.isViewingTrashNode || !nodeId || !runtime.editorRef.current) {
      return;
    }
    flushVisibleReadingJump(runtime, nodeId);
    const readingOffset = runtime.editorRef.current.getPrimaryVisiblePosition?.();
    ws.setNodeViewState(nodeId, {
      scrollTop: runtime.editorRef.current.getScrollTop(),
      ...(readingOffset != null ? { readingOffset } : {}),
      selection: resolveSelectionToPersist(runtime, nodeId)
    });
  }, [runtime, ws]);
}

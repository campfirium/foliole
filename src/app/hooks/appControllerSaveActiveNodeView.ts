import { useCallback } from 'react';

import { resolvePersistedViewStateSelection } from './persistedViewStateSelection';
import { useAppRuntime } from './useAppRuntime';

interface SaveActiveNodeViewWorkspaceState {
  activeNodeId: string | null;
  setNodeViewState: (nodeId: string, viewState: { scrollTop: number; selection: { from: number; to: number } }) => void;
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
    ws.setNodeViewState(nodeId, {
      scrollTop: runtime.editorRef.current.getScrollTop(),
      selection: resolveSelectionToPersist(runtime, nodeId)
    });
  }, [runtime.editorRef, runtime.isImmersiveMode, runtime.isViewingTrashNode, runtime.readingPositionRef, ws]);
}

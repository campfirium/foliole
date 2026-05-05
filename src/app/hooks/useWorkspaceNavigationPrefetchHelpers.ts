import { useCallback } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged
} from '../../shared/platform/performanceDiagnosticsProbe';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useNavigationTargetResolvers(activeNodeId: string | null, nodesById: Record<string, Node>) {
  const resolveBackTargetNodeId = useCallback(() => {
    const backStack = useWorkspaceStore.getState().navigation.backStack;
    return backStack[backStack.length - 1] ?? null;
  }, []);

  const resolveForwardTargetNodeId = useCallback(() => {
    return useWorkspaceStore.getState().navigation.forwardStack[0] ?? null;
  }, []);

  const resolveParentTargetNodeId = useCallback(() => {
    if (!activeNodeId) {
      return null;
    }
    return nodesById[activeNodeId]?.parentNodeId ?? null;
  }, [activeNodeId, nodesById]);

  return {
    resolveBackTargetNodeId,
    resolveForwardTargetNodeId,
    resolveParentTargetNodeId
  };
}

export function useNodeDocumentPrefetch() {
  return useCallback(async (nodeId: string) => {
    const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
    if (!targetNode || isNodeDocumentLoaded(targetNode)) {
      return;
    }

    await ensureWorkspaceNodeDocumentReady(nodeId, {
      keepWarm: true,
      onDocumentMerged: (document) => {
        markNodeDocumentMerged(nodeId, `content:${document.content.length}`);
      },
      onLoadResolved: () => {
        markNodeDocumentLoadResolved(nodeId);
      },
      onLoadStarted: () => {
        markNodeDocumentLoadStarted(nodeId);
      }
    });
  }, []);
}

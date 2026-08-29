import { useCallback } from 'react';

import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged
} from '../../shared/platform/performanceDiagnosticsProbe';
import {
  resolveBackNavigationTarget,
  resolveLastChildNavigationTarget,
  resolveForwardNavigationTarget,
  resolveParentNavigationTarget
} from '../../store/workspaceNavigationTargets';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useNavigationTargetResolvers() {
  const resolveBackTargetNodeId = useCallback(() => {
    return resolveBackNavigationTarget(useWorkspaceStore.getState()).nodeId;
  }, []);

  const resolveForwardTargetNodeId = useCallback(() => {
    return resolveForwardNavigationTarget(useWorkspaceStore.getState()).nodeId;
  }, []);

  const resolveParentTargetNodeId = useCallback(() => {
    return resolveParentNavigationTarget(useWorkspaceStore.getState());
  }, []);

  const resolveLastChildTargetNodeId = useCallback(() => {
    return resolveLastChildNavigationTarget(useWorkspaceStore.getState());
  }, []);

  return {
    resolveBackTargetNodeId,
    resolveLastChildTargetNodeId,
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

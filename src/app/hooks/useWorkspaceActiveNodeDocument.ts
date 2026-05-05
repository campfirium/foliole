import { useEffect } from 'react';

import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  beginNodeSelectionFlow,
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted
} from '../../shared/platform/performanceDiagnosticsProbe';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface UseWorkspaceActiveNodeDocumentOptions {
  keepWarm?: boolean;
}

export function useWorkspaceActiveNodeDocument(
  activeNodeId: string | null,
  options: UseWorkspaceActiveNodeDocumentOptions = {}
) {
  useEffect(() => {
    const runtimeInvoke = getRuntimeInvoke();
    if (!runtimeInvoke || !activeNodeId) {
      return;
    }

    const activeNode = useWorkspaceStore.getState().nodesById[activeNodeId];
    beginNodeSelectionFlow(activeNodeId, useWorkspaceStore.getState().nodesById);
    if (!activeNode || isNodeDocumentLoaded(activeNode)) {
      markNodeDocumentLoadResolved(activeNodeId);
      return;
    }

    let cancelled = false;
    void ensureWorkspaceNodeDocumentReady(activeNodeId, {
      keepWarm: options.keepWarm,
      onDocumentMerged: (document) => {
        if (!cancelled) {
          markNodeDocumentMerged(activeNodeId, `content:${document.content.length}`);
        }
      },
      onLoadResolved: () => {
        if (!cancelled) {
          markNodeDocumentLoadResolved(activeNodeId);
        }
      },
      onLoadStarted: () => {
        if (!cancelled) {
          markNodeDocumentLoadStarted(activeNodeId);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeNodeId, options.keepWarm]);
}

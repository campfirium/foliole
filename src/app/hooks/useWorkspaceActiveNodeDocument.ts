import { useEffect } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  beginNodeSelectionFlow,
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted
} from '../../shared/platform/performanceDiagnosticsProbe';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useWorkspaceActiveNodeDocument(activeNodeId: string | null) {
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
    markNodeDocumentLoadStarted(activeNodeId);
    void runtimeInvoke(NATIVE_COMMANDS.loadNodeDocument, { nodeId: activeNodeId }).then((document) => {
      if (!document || cancelled) {
        return;
      }
      markNodeDocumentLoadResolved(activeNodeId);
      markNodeDocumentMerged(activeNodeId, `content:${document.content.length}`);
      useWorkspaceStore.setState((state) => {
        const nextNode = state.nodesById[activeNodeId];
        if (!nextNode) {
          return state;
        }
        return {
          nodesById: {
            ...state.nodesById,
            [activeNodeId]: mergeWorkspaceNodeDocument(nextNode, document)
          }
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [activeNodeId]);
}

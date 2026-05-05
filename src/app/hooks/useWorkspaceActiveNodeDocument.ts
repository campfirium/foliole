import { useEffect, useRef } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  beginNodeSelectionFlow,
  markNodeDocumentMerged,
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markPreviousNodeTrimmed
} from '../../shared/platform/performanceDiagnosticsProbe';
import { hasPendingNodeSync } from '../../store/workspacePendingNodeSync';
import {
  isNodeDocumentLoaded,
  mergeWorkspaceNodeDocument,
  toRendererBoundaryNode
} from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useWorkspaceActiveNodeDocument(activeNodeId: string | null) {
  const previousActiveNodeIdRef = useRef<string | null>(activeNodeId);

  useEffect(() => {
    const runtimeInvoke = getRuntimeInvoke();
    const previousActiveNodeId = previousActiveNodeIdRef.current;
    previousActiveNodeIdRef.current = activeNodeId;

    if (previousActiveNodeId && previousActiveNodeId !== activeNodeId && !hasPendingNodeSync(previousActiveNodeId)) {
      markPreviousNodeTrimmed(previousActiveNodeId);
      useWorkspaceStore.setState((state) => {
        const previousNode = state.nodesById[previousActiveNodeId];
        if (!previousNode) {
          return state;
        }
        return {
          nodesById: {
            ...state.nodesById,
            [previousActiveNodeId]: toRendererBoundaryNode(previousNode, false)
          }
        };
      });
    }

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
      markNodeDocumentMerged(activeNodeId);
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

import { useCallback, useRef } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged
} from '../../shared/platform/performanceDiagnosticsProbe';
import { resolveAncestorAnchorLink, type NodeNavigationResult } from '../../store/workspaceNavigation';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function usePreparedOpenNodeAction(
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void
) {
  const requestTokenRef = useRef(0);

  return useCallback(
    async (nodeId: string, focusAnchor: NodeNavigationResult['focusAnchor'] = null) => {
      markRequested(nodeId);
      beforeNavigate();

      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (!targetNode || isNodeDocumentLoaded(targetNode) || !getRuntimeInvoke()) {
        finalize(null);
        return;
      }

      const requestToken = requestTokenRef.current + 1;
      requestTokenRef.current = requestToken;

      const result = await openWorkspaceNodeWithPreparedDocument(nodeId, {
        onDocumentMerged: (document) => {
          if (requestTokenRef.current === requestToken) {
            markNodeDocumentMerged(nodeId, `content:${document.content.length}`);
          }
        },
        onLoadResolved: () => {
          if (requestTokenRef.current === requestToken) {
            markNodeDocumentLoadResolved(nodeId);
          }
        },
        onLoadStarted: () => {
          if (requestTokenRef.current === requestToken) {
            markNodeDocumentLoadStarted(nodeId);
          }
        },
        shouldApply: () => requestTokenRef.current === requestToken
      });

      if (!result || requestTokenRef.current !== requestToken) {
        return;
      }

      finalize({ ...result, focusAnchor });
    },
    [beforeNavigate, finalize, markRequested]
  );
}

export function useBreadcrumbSelectionAction(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null,
  openNode: (nodeId: string) => NodeNavigationResult | null,
  saveActiveNodeView: (nodeIdOverride?: string | null) => void,
  finalizeNavigation: (result: NodeNavigationResult | null) => void,
  markSelectionRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>,
  openPreparedNode: (nodeId: string, focusAnchor?: NodeNavigationResult['focusAnchor']) => Promise<void>
) {
  return useCallback(
    async (nodeId: string) => {
      if (activeNodeId && activeNodeId !== nodeId) {
        const ancestorTarget = resolveAncestorAnchorLink(activeNodeId, nodeId, nodesById);
        const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
        if (ancestorTarget.isAncestor && targetNode && !isNodeDocumentLoaded(targetNode) && getRuntimeInvoke()) {
          await openPreparedNode(nodeId, ancestorTarget.focusAnchor);
          return;
        }
      }

      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (targetNode && !isNodeDocumentLoaded(targetNode) && getRuntimeInvoke()) {
        await openPreparedNode(nodeId);
        return;
      }

      markSelectionRequested(nodeId);
      const result = jumpToAncestorNode(nodeId) ?? openNode(nodeId);
      saveActiveNodeView(activeNodeId);
      finalizeNavigation(result);
      void ensureNodeReady(nodeId);
    },
    [
      activeNodeId,
      ensureNodeReady,
      finalizeNavigation,
      jumpToAncestorNode,
      markSelectionRequested,
      nodesById,
      openNode,
      openPreparedNode,
      saveActiveNodeView
    ]
  );
}

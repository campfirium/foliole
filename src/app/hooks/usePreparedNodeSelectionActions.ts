import { useCallback, useRef } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged
} from '../../shared/platform/performanceDiagnosticsProbe';
import { resolveAncestorAnchorLink, type NodeNavigationResult } from '../../store/workspaceNavigation';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function usePreparedOpenNodeAction(
  action: (nodeId: string) => NodeNavigationResult | null,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void
) {
  const requestTokenRef = useRef(0);

  return useCallback(
    async (nodeId: string, focusAnchor: NodeNavigationResult['focusAnchor'] = null) => {
      markRequested(nodeId);
      flushPendingEditorDraft();
      await flushPendingEditorDraftImmediately();
      prepareForNavigation();
      const result = action(nodeId);
      finalize(result ? { ...result, focusAnchor } : result);

      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (!targetNode || isNodeDocumentLoaded(targetNode) || !getRuntimeInvoke()) {
        return;
      }

      const requestToken = requestTokenRef.current + 1;
      requestTokenRef.current = requestToken;

      await ensureWorkspaceNodeDocumentReady(nodeId, {
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
        }
      });
    },
    [action, finalize, flushPendingEditorDraft, flushPendingEditorDraftImmediately, markRequested, prepareForNavigation]
  );
}

export function useBreadcrumbSelectionAction(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null,
  openNode: (nodeId: string) => NodeNavigationResult | null,
  flushPendingEditorDraft: () => void,
  flushPendingEditorDraftImmediately: () => Promise<boolean>,
  prepareForNavigation: (nodeIdOverride?: string | null) => void,
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
      flushPendingEditorDraft();
      await flushPendingEditorDraftImmediately();
      prepareForNavigation(activeNodeId);
      const result = jumpToAncestorNode(nodeId) ?? openNode(nodeId);
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
      prepareForNavigation,
      flushPendingEditorDraft,
      flushPendingEditorDraftImmediately,
    ]
  );
}

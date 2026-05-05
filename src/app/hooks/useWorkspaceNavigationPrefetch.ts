import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { getRuntimeInvoke } from '../../shared/platform/bridge';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged,
  markNodeSelectionRequested
} from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useBreadcrumbSelectionAction, usePreparedOpenNodeAction } from './usePreparedNodeSelectionActions';

export interface PreparedNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  closeContextMenu: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  saveActiveNodeView: (nodeIdOverride?: string | null) => void;
  applyNavigationResult: (result: NodeNavigationResult | null) => void;
}

function useNavigationAction(
  action: () => NodeNavigationResult | null,
  saveActiveNodeView: (nodeIdOverride?: string | null) => void,
  finalize: (result: NodeNavigationResult | null) => void,
  resolveTargetNodeId: () => string | null,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>
) {
  return useCallback(() => {
    const sourceNodeId = useWorkspaceStore.getState().activeNodeId;
    const targetNodeId = resolveTargetNodeId();
    if (targetNodeId) {
      markRequested(targetNodeId);
    }
    const result = action();
    saveActiveNodeView(sourceNodeId);
    finalize(result);
    if (targetNodeId) {
      void ensureNodeReady(targetNodeId);
    }
  }, [action, ensureNodeReady, finalize, markRequested, resolveTargetNodeId, saveActiveNodeView]);
}

function useSelectNodeAction(
  action: (nodeId: string) => NodeNavigationResult | null,
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>,
  openPreparedNode: (nodeId: string, focusAnchor?: NodeNavigationResult['focusAnchor']) => Promise<void>
) {
  return useCallback(
    async (nodeId: string, focusAnchor: NodeAnchorLink | null = null) => {
      const targetNode = useWorkspaceStore.getState().nodesById[nodeId];
      if (targetNode && !isNodeDocumentLoaded(targetNode) && getRuntimeInvoke()) {
        await openPreparedNode(nodeId, focusAnchor);
        return;
      }

      markRequested(nodeId);
      beforeNavigate();
      const result = action(nodeId);
      finalize(result ? { ...result, focusAnchor } : result);
      void ensureNodeReady(nodeId);
    },
    [action, beforeNavigate, ensureNodeReady, finalize, markRequested, openPreparedNode]
  );
}

function useSelectionRequestedMarker(nodesById: Record<string, Node>) {
  return useCallback(
    (nodeId: string) => {
      markNodeSelectionRequested(nodeId, nodesById);
    },
    [nodesById]
  );
}

function useNavigationTargetResolvers(activeNodeId: string | null, nodesById: Record<string, Node>) {
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

function useNodeDocumentPrefetch() {
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

function useFinalizeNavigation(
  closeContextMenu: () => void,
  applyNavigationResult: (result: NodeNavigationResult | null) => void
) {
  return useCallback(
    (result: NodeNavigationResult | null) => {
      closeContextMenu();
      applyNavigationResult(result);
    },
    [applyNavigationResult, closeContextMenu]
  );
}

export function usePreparedNavigationHandlers(args: PreparedNavigationDependencies) {
  const markSelectionRequested = useSelectionRequestedMarker(args.nodesById);
  const ensureNodeReady = useNodeDocumentPrefetch();
  const finalizeNavigation = useFinalizeNavigation(args.closeContextMenu, args.applyNavigationResult);
  const openPreparedNode = usePreparedOpenNodeAction(
    args.saveActiveNodeView,
    finalizeNavigation,
    markSelectionRequested
  );
  const targetResolvers = useNavigationTargetResolvers(args.activeNodeId, args.nodesById);
  const handleSelectBreadcrumbNode = useBreadcrumbSelectionAction(
    args.activeNodeId,
    args.nodesById,
    args.jumpToAncestorNode,
    args.openNode,
    args.saveActiveNodeView,
    finalizeNavigation,
    markSelectionRequested,
    ensureNodeReady,
    openPreparedNode
  );

  return {
    handleSelectNode: useSelectNodeAction(
      args.openNode,
      args.saveActiveNodeView,
      finalizeNavigation,
      markSelectionRequested,
      ensureNodeReady,
      openPreparedNode
    ),
    handleSelectBreadcrumbNode,
    handleGoBack: useNavigationAction(
      args.goBack,
      args.saveActiveNodeView,
      finalizeNavigation,
      targetResolvers.resolveBackTargetNodeId,
      markSelectionRequested,
      ensureNodeReady
    ),
    handleGoForward: useNavigationAction(
      args.goForward,
      args.saveActiveNodeView,
      finalizeNavigation,
      targetResolvers.resolveForwardTargetNodeId,
      markSelectionRequested,
      ensureNodeReady
    ),
    handleGoParent: useNavigationAction(
      args.goToParent,
      args.saveActiveNodeView,
      finalizeNavigation,
      targetResolvers.resolveParentTargetNodeId,
      markSelectionRequested,
      ensureNodeReady
    )
  };
}

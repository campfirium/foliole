import { useCallback } from 'react';
import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  markNodeDocumentLoadResolved,
  markNodeDocumentLoadStarted,
  markNodeDocumentMerged,
  markNodeSelectionRequested
} from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { ensureWorkspaceNodeDocumentReady, openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

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
  saveActiveNodeView: () => void;
  applyNavigationResult: (result: NodeNavigationResult | null) => void;
}

function useNavigationAction(
  action: () => NodeNavigationResult | null,
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void,
  resolveTargetNodeId: () => string | null,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>
) {
  return useCallback(() => {
    const targetNodeId = resolveTargetNodeId();
    const run = async () => {
      if (targetNodeId) {
        markRequested(targetNodeId);
        await ensureNodeReady(targetNodeId);
      }
      beforeNavigate();
      finalize(action());
    };
    void run();
  }, [action, beforeNavigate, ensureNodeReady, finalize, markRequested, resolveTargetNodeId]);
}

function usePreparedSelectNodeAction(
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void,
  openPreparedNode: (nodeId: string) => Promise<NodeNavigationResult | null>
) {
  return useCallback(
    async (nodeId: string) => {
      markRequested(nodeId);
      beforeNavigate();
      finalize(await openPreparedNode(nodeId));
    },
    [beforeNavigate, finalize, markRequested, openPreparedNode]
  );
}

function useSelectNodeAction(
  action: (nodeId: string) => NodeNavigationResult | null,
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void,
  ensureNodeReady: (nodeId: string) => Promise<void>
) {
  return useCallback(
    async (nodeId: string) => {
      markRequested(nodeId);
      await ensureNodeReady(nodeId);
      beforeNavigate();
      finalize(action(nodeId));
    },
    [action, beforeNavigate, ensureNodeReady, finalize, markRequested]
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

function usePreparedNodeOpen() {
  return useCallback(
    async (nodeId: string) =>
      openWorkspaceNodeWithPreparedDocument(nodeId, {
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
      }),
    []
  );
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
  const openPreparedNode = usePreparedNodeOpen();
  const finalizeNavigation = useFinalizeNavigation(args.closeContextMenu, args.applyNavigationResult);
  const targetResolvers = useNavigationTargetResolvers(args.activeNodeId, args.nodesById);

  return {
    handleSelectNode: usePreparedSelectNodeAction(
      args.saveActiveNodeView,
      finalizeNavigation,
      markSelectionRequested,
      openPreparedNode
    ),
    handleSelectBreadcrumbNode: useSelectNodeAction(
      (nodeId) => args.jumpToAncestorNode(nodeId) ?? args.openNode(nodeId),
      args.saveActiveNodeView,
      finalizeNavigation,
      markSelectionRequested,
      ensureNodeReady
    ),
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

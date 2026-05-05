import { useCallback, useEffect, useState, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import type { Node, NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';
import { markNodeSelectionRequested } from '../../shared/platform/performanceDiagnosticsProbe';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

interface WorkspaceNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  activeNodeParentId: string | null;
  backStackSize: number;
  closeContextMenu: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  forwardStackSize: number;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  saveActiveNodeView: () => void;
}

interface WorkspaceNavigationHandlers {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoParent: boolean;
  handleGoBack: () => void;
  handleGoForward: () => void;
  handleGoParent: () => void;
  handleSelectBreadcrumbNode: (nodeId: string) => void;
  handleSelectNode: (nodeId: string) => void;
}

type PendingAnchor = NodeAnchorLink;

function usePendingAnchorNavigation(
  activeNodeContent: string | null,
  activeNodeId: string | null,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  const [pendingAnchorNodeId, setPendingAnchorNodeId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);

  const clearPendingAnchor = useCallback(() => {
    setPendingAnchorNodeId(null);
    setPendingAnchor(null);
  }, []);

  const applyNavigationResult = useCallback((result: NodeNavigationResult | null) => {
    if (!result) {
      return;
    }
    setPendingAnchorNodeId(result.nodeId);
    setPendingAnchor(result.focusAnchor);
  }, []);

  useEffect(() => {
    if (!activeNodeId || !pendingAnchorNodeId || !pendingAnchor || pendingAnchorNodeId !== activeNodeId) {
      return;
    }
    if (pendingAnchor.kind === 'highlight' && pendingAnchor.locator) {
      requestPdfAnchorJump(activeNodeId, pendingAnchor.locator);
      clearPendingAnchor();
      return;
    }
    if (!activeNodeContent) {
      clearPendingAnchor();
      return;
    }
    const selection = findAnchorSelection(activeNodeContent, pendingAnchor);
    const adapter = editorRef.current;
    if (!selection || !adapter) {
      clearPendingAnchor();
      return;
    }
    adapter.revealSelection(selection);
    clearPendingAnchor();
  }, [activeNodeContent, activeNodeId, clearPendingAnchor, editorRef, pendingAnchor, pendingAnchorNodeId]);

  useEffect(() => {
    if (!pendingAnchorNodeId || pendingAnchorNodeId === activeNodeId) {
      return;
    }
    clearPendingAnchor();
  }, [activeNodeId, clearPendingAnchor, pendingAnchorNodeId]);

  return applyNavigationResult;
}

function useNavigationAction(
  action: () => NodeNavigationResult | null,
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void
) {
  return useCallback(() => {
    beforeNavigate();
    finalize(action());
  }, [action, beforeNavigate, finalize]);
}

function useSelectNodeAction(
  action: (nodeId: string) => NodeNavigationResult | null,
  beforeNavigate: () => void,
  finalize: (result: NodeNavigationResult | null) => void,
  markRequested: (nodeId: string) => void
) {
  return useCallback(
    (nodeId: string) => {
      markRequested(nodeId);
      beforeNavigate();
      finalize(action(nodeId));
    },
    [action, beforeNavigate, finalize, markRequested]
  );
}

export function useWorkspaceNavigation({
  activeNodeContent,
  activeNodeId,
  activeNodeParentId,
  backStackSize,
  closeContextMenu,
  editorRef,
  forwardStackSize,
  goBack,
  goForward,
  goToParent,
  jumpToAncestorNode,
  nodesById,
  openNode,
  saveActiveNodeView
}: WorkspaceNavigationDependencies): WorkspaceNavigationHandlers {
  const applyNavigationResult = usePendingAnchorNavigation(activeNodeContent, activeNodeId, editorRef);
  const markSelectionRequested = useCallback(
    (nodeId: string) => {
      markNodeSelectionRequested(nodeId, nodesById);
    },
    [nodesById]
  );

  const finalizeNavigation = useCallback(
    (result: NodeNavigationResult | null) => {
      closeContextMenu();
      applyNavigationResult(result);
    },
    [applyNavigationResult, closeContextMenu]
  );

  const handleSelectNode = useSelectNodeAction(openNode, saveActiveNodeView, finalizeNavigation, markSelectionRequested);
  const handleSelectBreadcrumbNode = useSelectNodeAction(
    (nodeId) => jumpToAncestorNode(nodeId) ?? openNode(nodeId),
    saveActiveNodeView,
    finalizeNavigation,
    markSelectionRequested
  );

  return {
    canGoBack: backStackSize > 0,
    canGoForward: forwardStackSize > 0,
    canGoParent: Boolean(activeNodeParentId),
    handleGoBack: useNavigationAction(goBack, saveActiveNodeView, finalizeNavigation),
    handleGoForward: useNavigationAction(goForward, saveActiveNodeView, finalizeNavigation),
    handleGoParent: useNavigationAction(goToParent, saveActiveNodeView, finalizeNavigation),
    handleSelectBreadcrumbNode,
    handleSelectNode
  };
}

import { useCallback, useEffect, useState, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { isPdfAnchorLocator, type Node, type NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

import { usePreparedNavigationHandlers } from './useWorkspaceNavigationPrefetch';

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
  handleSelectNode: (nodeId: string, focusAnchor?: NodeAnchorLink | null) => void;
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
    if (pendingAnchor.kind === 'highlight' && isPdfAnchorLocator(pendingAnchor.locator)) {
      requestPdfAnchorJump(activeNodeId, pendingAnchor.locator);
      clearPendingAnchor();
      return;
    }
    if (!activeNodeContent) {
      return;
    }
    const adapter = editorRef.current;
    if (!adapter) {
      return;
    }
    const selection = findAnchorSelection(activeNodeContent, pendingAnchor);
    if (!selection) {
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
  const preparedHandlers = usePreparedNavigationHandlers({
    applyNavigationResult,
    activeNodeContent,
    activeNodeId,
    closeContextMenu,
    editorRef,
    goBack,
    goForward,
    goToParent,
    jumpToAncestorNode,
    nodesById,
    openNode,
    saveActiveNodeView
  });

  return {
    canGoBack: backStackSize > 0,
    canGoForward: forwardStackSize > 0,
    canGoParent: Boolean(activeNodeParentId),
    ...preparedHandlers
  };
}

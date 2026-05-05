import { useCallback, useEffect, useState, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
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

type PendingAnchor = { id: string; kind: 'highlight' | 'cloze' };

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
    if (!activeNodeId || !pendingAnchorNodeId || !pendingAnchor || pendingAnchorNodeId !== activeNodeId || !activeNodeContent) {
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

function useNavigationAction(action: () => NodeNavigationResult | null, finalize: (result: NodeNavigationResult | null) => void) {
  return useCallback(() => {
    finalize(action());
  }, [action, finalize]);
}

function useSelectNodeAction(
  action: (nodeId: string) => NodeNavigationResult | null,
  finalize: (result: NodeNavigationResult | null) => void
) {
  return useCallback(
    (nodeId: string) => {
      finalize(action(nodeId));
    },
    [action, finalize]
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
  openNode,
  saveActiveNodeView
}: WorkspaceNavigationDependencies): WorkspaceNavigationHandlers {
  const applyNavigationResult = usePendingAnchorNavigation(activeNodeContent, activeNodeId, editorRef);

  const finalizeNavigation = useCallback(
    (result: NodeNavigationResult | null) => {
      closeContextMenu();
      saveActiveNodeView();
      applyNavigationResult(result);
    },
    [applyNavigationResult, closeContextMenu, saveActiveNodeView]
  );

  const handleSelectNode = useSelectNodeAction(openNode, finalizeNavigation);
  const handleSelectBreadcrumbNode = useSelectNodeAction(
    (nodeId) => jumpToAncestorNode(nodeId) ?? openNode(nodeId),
    finalizeNavigation
  );

  return {
    canGoBack: backStackSize > 0,
    canGoForward: forwardStackSize > 0,
    canGoParent: Boolean(activeNodeParentId),
    handleGoBack: useNavigationAction(goBack, finalizeNavigation),
    handleGoForward: useNavigationAction(goForward, finalizeNavigation),
    handleGoParent: useNavigationAction(goToParent, finalizeNavigation),
    handleSelectBreadcrumbNode,
    handleSelectNode
  };
}

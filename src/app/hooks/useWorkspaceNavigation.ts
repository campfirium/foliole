import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import { createCommandRegistry } from '../../shared/commands/registry';
import { onWindowKeydown } from '../../shared/platform/keyboard';
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
  const [pendingAnchorNodeId, setPendingAnchorNodeId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<{ id: string; kind: 'highlight' | 'cloze' } | null>(null);

  const applyNavigationResult = useCallback((result: NodeNavigationResult | null) => {
    if (!result) {
      return;
    }
    setPendingAnchorNodeId(result.nodeId);
    setPendingAnchor(result.focusAnchor);
  }, []);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      closeContextMenu();
      saveActiveNodeView();
      applyNavigationResult(openNode(nodeId));
    },
    [applyNavigationResult, closeContextMenu, openNode, saveActiveNodeView]
  );

  const handleSelectBreadcrumbNode = useCallback(
    (nodeId: string) => {
      closeContextMenu();
      saveActiveNodeView();
      applyNavigationResult(jumpToAncestorNode(nodeId) ?? openNode(nodeId));
    },
    [applyNavigationResult, closeContextMenu, jumpToAncestorNode, openNode, saveActiveNodeView]
  );

  const handleGoBack = useCallback(() => {
    closeContextMenu();
    saveActiveNodeView();
    applyNavigationResult(goBack());
  }, [applyNavigationResult, closeContextMenu, goBack, saveActiveNodeView]);

  const handleGoForward = useCallback(() => {
    closeContextMenu();
    saveActiveNodeView();
    applyNavigationResult(goForward());
  }, [applyNavigationResult, closeContextMenu, goForward, saveActiveNodeView]);

  const handleGoParent = useCallback(() => {
    closeContextMenu();
    saveActiveNodeView();
    applyNavigationResult(goToParent());
  }, [applyNavigationResult, closeContextMenu, goToParent, saveActiveNodeView]);

  const navigationCommandRegistry = useMemo(
    () =>
      createCommandRegistry([
        {
          id: 'navigation.goBack',
          execute: handleGoBack,
          shortcut: { key: 'ArrowLeft', altKey: true }
        },
        {
          id: 'navigation.goForward',
          execute: handleGoForward,
          shortcut: { key: 'ArrowRight', altKey: true }
        }
      ]),
    [handleGoBack, handleGoForward]
  );

  useEffect(() => {
    if (!activeNodeId || !pendingAnchorNodeId || !pendingAnchor || pendingAnchorNodeId !== activeNodeId || !activeNodeContent) {
      return;
    }
    const adapter = editorRef.current;
    if (!adapter) {
      return;
    }

    const selection = findAnchorSelection(activeNodeContent, pendingAnchor);
    if (!selection) {
      setPendingAnchorNodeId(null);
      setPendingAnchor(null);
      return;
    }
    adapter.revealSelection(selection);
    setPendingAnchorNodeId(null);
    setPendingAnchor(null);
  }, [activeNodeContent, activeNodeId, editorRef, pendingAnchor, pendingAnchorNodeId]);

  useEffect(() => {
    if (!pendingAnchorNodeId || pendingAnchorNodeId === activeNodeId) {
      return;
    }
    setPendingAnchorNodeId(null);
    setPendingAnchor(null);
  }, [activeNodeId, pendingAnchorNodeId]);

  useEffect(() => {
    const handleNavigationHotkeys = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      navigationCommandRegistry.runByShortcut(event);
    };

    return onWindowKeydown(handleNavigationHotkeys);
  }, [navigationCommandRegistry]);

  return {
    canGoBack: backStackSize > 0,
    canGoForward: forwardStackSize > 0,
    canGoParent: Boolean(activeNodeParentId),
    handleGoBack,
    handleGoForward,
    handleGoParent,
    handleSelectBreadcrumbNode,
    handleSelectNode
  };
}

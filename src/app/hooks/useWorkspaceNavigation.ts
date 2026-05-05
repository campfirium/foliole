import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

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
  shouldSuppressSelectionRestore: () => boolean;
}

type PendingAnchor = NodeAnchorLink;

function useRestoreSuppressionController(activeNodeId: string | null) {
  const [suppressedRestoreNodeId, setSuppressedRestoreNodeId] = useState<string | null>(null);
  const clearSuppressionFrameRef = useRef<number | null>(null);
  const clearSuppressionFrame2Ref = useRef<number | null>(null);

  const clearSuppressionFrames = useCallback(() => {
    if (clearSuppressionFrameRef.current !== null) {
      cancelAnimationFrame(clearSuppressionFrameRef.current);
      clearSuppressionFrameRef.current = null;
    }
    if (clearSuppressionFrame2Ref.current !== null) {
      cancelAnimationFrame(clearSuppressionFrame2Ref.current);
      clearSuppressionFrame2Ref.current = null;
    }
  }, []);

  const releaseRestoreSuppression = useCallback(() => {
    clearSuppressionFrames();
    setSuppressedRestoreNodeId(null);
  }, [clearSuppressionFrames]);

  const scheduleRestoreSuppressionRelease = useCallback(
    (nodeId: string) => {
      clearSuppressionFrames();
      clearSuppressionFrameRef.current = requestAnimationFrame(() => {
        clearSuppressionFrameRef.current = null;
        clearSuppressionFrame2Ref.current = requestAnimationFrame(() => {
          clearSuppressionFrame2Ref.current = null;
          setSuppressedRestoreNodeId((currentNodeId) => (currentNodeId === nodeId ? null : currentNodeId));
        });
      });
    },
    [clearSuppressionFrames]
  );

  useEffect(() => {
    if (!suppressedRestoreNodeId || suppressedRestoreNodeId === activeNodeId) {
      return;
    }
    releaseRestoreSuppression();
  }, [activeNodeId, releaseRestoreSuppression, suppressedRestoreNodeId]);

  useEffect(() => () => clearSuppressionFrames(), [clearSuppressionFrames]);

  return {
    releaseRestoreSuppression,
    scheduleRestoreSuppressionRelease,
    setSuppressedRestoreNodeId,
    suppressedRestoreNodeId
  };
}

function usePendingAnchorReveal(
  activeNodeContent: string | null,
  activeNodeId: string | null,
  editorRef: MutableRefObject<EditorAdapter | null>,
  pendingAnchorNodeId: string | null,
  pendingAnchor: PendingAnchor | null,
  clearPendingAnchor: () => void,
  scheduleRestoreSuppressionRelease: (nodeId: string) => void
) {
  useEffect(() => {
    if (!activeNodeId || !pendingAnchorNodeId || !pendingAnchor || pendingAnchorNodeId !== activeNodeId) {
      return;
    }
    if (pendingAnchor.kind === 'highlight' && isPdfAnchorLocator(pendingAnchor.locator)) {
      requestPdfAnchorJump(activeNodeId, pendingAnchor.locator);
      scheduleRestoreSuppressionRelease(activeNodeId);
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
      scheduleRestoreSuppressionRelease(activeNodeId);
      clearPendingAnchor();
      return;
    }
    adapter.revealSelection(selection);
    scheduleRestoreSuppressionRelease(activeNodeId);
    clearPendingAnchor();
  }, [
    activeNodeContent,
    activeNodeId,
    clearPendingAnchor,
    editorRef,
    pendingAnchor,
    pendingAnchorNodeId,
    scheduleRestoreSuppressionRelease
  ]);
}

function usePendingAnchorNavigation(
  activeNodeContent: string | null,
  activeNodeId: string | null,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  const [pendingAnchorNodeId, setPendingAnchorNodeId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const {
    releaseRestoreSuppression,
    scheduleRestoreSuppressionRelease,
    setSuppressedRestoreNodeId,
    suppressedRestoreNodeId
  } = useRestoreSuppressionController(activeNodeId);

  const clearPendingAnchor = useCallback(() => {
    setPendingAnchorNodeId(null);
    setPendingAnchor(null);
  }, []);

  const applyNavigationResult = useCallback((result: NodeNavigationResult | null) => {
    if (!result) {
      releaseRestoreSuppression();
      return;
    }
    setPendingAnchorNodeId(result.nodeId);
    setPendingAnchor(result.focusAnchor);
    setSuppressedRestoreNodeId(result.focusAnchor ? result.nodeId : null);
  }, [releaseRestoreSuppression, setSuppressedRestoreNodeId]);

  usePendingAnchorReveal(
    activeNodeContent,
    activeNodeId,
    editorRef,
    pendingAnchorNodeId,
    pendingAnchor,
    clearPendingAnchor,
    scheduleRestoreSuppressionRelease
  );

  useEffect(() => {
    if (!pendingAnchorNodeId || pendingAnchorNodeId === activeNodeId) {
      return;
    }
    clearPendingAnchor();
  }, [activeNodeId, clearPendingAnchor, pendingAnchorNodeId]);

  const shouldSuppressSelectionRestore = useCallback(
    () =>
      Boolean(
        activeNodeId &&
          ((pendingAnchorNodeId === activeNodeId && pendingAnchor) || suppressedRestoreNodeId === activeNodeId)
      ),
    [activeNodeId, pendingAnchor, pendingAnchorNodeId, suppressedRestoreNodeId]
  );

  return {
    applyNavigationResult,
    shouldSuppressSelectionRestore
  };
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
  const { applyNavigationResult, shouldSuppressSelectionRestore } = usePendingAnchorNavigation(
    activeNodeContent,
    activeNodeId,
    editorRef
  );
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
    shouldSuppressSelectionRestore,
    ...preparedHandlers
  };
}

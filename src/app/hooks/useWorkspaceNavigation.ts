import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import {
  getTextAnchorLocators,
  isPdfAnchorLocator,
  type Node,
  type NodeAnchorLink
} from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

import { usePreparedNavigationHandlers } from './useWorkspaceNavigationPrefetch';

interface WorkspaceNavigationDependencies {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  activeNodeParentId: string | null;
  backStackSize: number;
  beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => void;
  closeContextMenu: () => void;
  completeAnchorNavigationRestore: (nodeId: string, reason: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  forwardStackSize: number;
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (nodeId: string) => NodeNavigationResult | null;
  nodesById: Record<string, Node>;
  openNode: (nodeId: string) => NodeNavigationResult | null;
  saveActiveNodeView: (nodeIdOverride?: string | null) => void;
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
const TEXT_ANCHOR_REVEAL_RATIO = 0.18;

function resolveAnchorRestoreSelection(anchor: PendingAnchor | null): EditorSelection | null {
  if (!anchor || isPdfAnchorLocator(anchor.locator)) {
    return null;
  }
  const firstLocator = getTextAnchorLocators(anchor.locator)[0];
  if (!firstLocator) {
    return null;
  }
  return {
    from: Math.max(0, firstLocator.from),
    to: Math.max(0, firstLocator.from)
  };
}

function revealPendingAnchor(args: {
  activeNodeContent: string;
  activeNodeId: string;
  clearPendingAnchor: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  pendingAnchor: PendingAnchor;
  scheduleRestoreSuppressionRelease: (nodeId: string) => void;
}) {
  if (args.pendingAnchor.kind === 'highlight' && isPdfAnchorLocator(args.pendingAnchor.locator)) {
    requestPdfAnchorJump(args.activeNodeId, args.pendingAnchor.locator);
    args.scheduleRestoreSuppressionRelease(args.activeNodeId);
    args.clearPendingAnchor();
    return true;
  }

  const adapter = args.editorRef.current;
  if (!adapter) {
    return false;
  }

  const selection = findAnchorSelection(args.activeNodeContent, args.pendingAnchor);
  if (!selection) {
    args.scheduleRestoreSuppressionRelease(args.activeNodeId);
    args.clearPendingAnchor();
    return true;
  }

  if (typeof adapter.revealPosition === 'function') {
    adapter.revealPosition(selection.from);
  } else if (adapter.revealSelectionAtViewportRatio) {
    adapter.revealSelectionAtViewportRatio({ from: selection.from, to: selection.from }, TEXT_ANCHOR_REVEAL_RATIO);
  } else {
    adapter.revealSelection({ from: selection.from, to: selection.from });
  }

  const isSelectionPositioned =
    typeof adapter.isPositionNearViewportRatio === 'function'
      ? adapter.isPositionNearViewportRatio(selection.from, TEXT_ANCHOR_REVEAL_RATIO, 0.08)
      : typeof adapter.getSelection === 'function'
        ? adapter.getSelection().from === selection.from && adapter.getSelection().to === selection.to
        : true;

  if (!isSelectionPositioned) {
    return false;
  }

  args.scheduleRestoreSuppressionRelease(args.activeNodeId);
  args.clearPendingAnchor();
  return true;
}

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
  completeAnchorNavigationRestore: (nodeId: string, reason: string) => void,
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
    if (!activeNodeContent && !isPdfAnchorLocator(pendingAnchor.locator)) {
      return;
    }

    if (
      revealPendingAnchor({
        activeNodeContent: activeNodeContent ?? '',
        activeNodeId,
        clearPendingAnchor,
        editorRef,
        pendingAnchor,
        scheduleRestoreSuppressionRelease
      })
    ) {
      completeAnchorNavigationRestore(activeNodeId, 'anchor-revealed');
      return;
    }

    let frameId = 0;
    let attemptsRemaining = 8;

    const retryReveal = () => {
      if (
        revealPendingAnchor({
          activeNodeContent: activeNodeContent ?? '',
          activeNodeId,
          clearPendingAnchor,
          editorRef,
          pendingAnchor,
          scheduleRestoreSuppressionRelease
        })
      ) {
        completeAnchorNavigationRestore(activeNodeId, 'anchor-revealed');
        return;
      }
      attemptsRemaining -= 1;
      if (attemptsRemaining <= 0) {
        completeAnchorNavigationRestore(activeNodeId, 'anchor-reveal-timeout');
        return;
      }
      frameId = requestAnimationFrame(retryReveal);
    };

    frameId = requestAnimationFrame(retryReveal);

    return () => {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [
    activeNodeContent,
    activeNodeId,
    completeAnchorNavigationRestore,
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
  beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => void,
  completeAnchorNavigationRestore: (nodeId: string, reason: string) => void,
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
    const pendingSelection = resolveAnchorRestoreSelection(result.focusAnchor);
    if (pendingSelection) {
      beginAnchorNavigationRestore(result.nodeId, pendingSelection);
    }
    setPendingAnchorNodeId(result.nodeId);
    setPendingAnchor(result.focusAnchor);
    setSuppressedRestoreNodeId(result.focusAnchor ? result.nodeId : null);
  }, [beginAnchorNavigationRestore, releaseRestoreSuppression, setSuppressedRestoreNodeId]);

  usePendingAnchorReveal(
    activeNodeContent,
    activeNodeId,
    completeAnchorNavigationRestore,
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
    completeAnchorNavigationRestore(pendingAnchorNodeId, 'anchor-node-mismatch');
    clearPendingAnchor();
  }, [activeNodeId, clearPendingAnchor, completeAnchorNavigationRestore, pendingAnchorNodeId]);

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
  beginAnchorNavigationRestore,
  closeContextMenu,
  completeAnchorNavigationRestore,
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
    beginAnchorNavigationRestore,
    completeAnchorNavigationRestore,
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

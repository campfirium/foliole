import { useCallback, useEffect, useRef, useState } from 'react';

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { findAnchorSelection } from '../../features/editor/model/anchorNavigation';
import {
  getTextAnchorLocators,
  isPdfAnchorLocator,
  type NodeAnchorLink
} from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemBridge';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';

type PendingAnchor = NodeAnchorLink;

function resolveAnchorRestoreSelection(anchor: PendingAnchor | null): EditorSelection | null {
  if (!anchor || isPdfAnchorLocator(anchor.locator)) {
    return null;
  }
  const firstLocator = getTextAnchorLocators(anchor.locator)[0];
  return firstLocator ? { from: Math.max(0, firstLocator.from), to: Math.max(0, firstLocator.from) } : null;
}

function revealPendingAnchor(args: {
  activeNodeContent: string;
  activeNodeId: string;
  beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => void;
  clearPendingAnchor: () => void;
  pendingAnchor: PendingAnchor;
  scheduleRestoreSuppressionRelease: (nodeId: string) => void;
}) {
  if (args.pendingAnchor.kind === 'highlight' && isPdfAnchorLocator(args.pendingAnchor.locator)) {
    requestPdfAnchorJump(args.activeNodeId, args.pendingAnchor.locator);
    args.scheduleRestoreSuppressionRelease(args.activeNodeId);
    args.clearPendingAnchor();
    return true;
  }
  const selection = findAnchorSelection(args.activeNodeContent, args.pendingAnchor);
  if (!selection) {
    args.scheduleRestoreSuppressionRelease(args.activeNodeId);
    args.clearPendingAnchor();
    return true;
  }
  args.beginAnchorNavigationRestore(args.activeNodeId, {
    from: selection.from,
    to: selection.from
  });
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
  const scheduleRestoreSuppressionRelease = useCallback((nodeId: string) => {
    clearSuppressionFrames();
    clearSuppressionFrameRef.current = requestAnimationFrame(() => {
      clearSuppressionFrameRef.current = null;
      clearSuppressionFrame2Ref.current = requestAnimationFrame(() => {
        clearSuppressionFrame2Ref.current = null;
        setSuppressedRestoreNodeId((currentNodeId) => (currentNodeId === nodeId ? null : currentNodeId));
      });
    });
  }, [clearSuppressionFrames]);
  useEffect(() => {
    if (!suppressedRestoreNodeId || suppressedRestoreNodeId === activeNodeId) {
      return;
    }
    releaseRestoreSuppression();
  }, [activeNodeId, releaseRestoreSuppression, suppressedRestoreNodeId]);
  useEffect(() => () => clearSuppressionFrames(), [clearSuppressionFrames]);
  return { releaseRestoreSuppression, scheduleRestoreSuppressionRelease, setSuppressedRestoreNodeId, suppressedRestoreNodeId };
}

function usePendingAnchorReveal(args: {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => void;
  clearPendingAnchor: () => void;
  completeAnchorNavigationRestore: (nodeId: string, reason: string) => void;
  pendingAnchor: PendingAnchor | null;
  pendingAnchorNodeId: string | null;
  scheduleRestoreSuppressionRelease: (nodeId: string) => void;
}) {
  useEffect(() => {
    if (!args.activeNodeId || !args.pendingAnchorNodeId || !args.pendingAnchor || args.pendingAnchorNodeId !== args.activeNodeId) {
      return;
    }
    const activeNodeId = args.activeNodeId;
    const pendingAnchor = args.pendingAnchor;
    if (!args.activeNodeContent && !isPdfAnchorLocator(pendingAnchor.locator)) {
      return;
    }
    const tryReveal = () => revealPendingAnchor({
      activeNodeContent: args.activeNodeContent ?? '',
      activeNodeId,
      beginAnchorNavigationRestore: args.beginAnchorNavigationRestore,
      clearPendingAnchor: args.clearPendingAnchor,
      pendingAnchor,
      scheduleRestoreSuppressionRelease: args.scheduleRestoreSuppressionRelease
    });
    if (tryReveal()) {
      return;
    }
    let frameId = 0;
    let attemptsRemaining = 8;
    const retryReveal = () => {
      if (tryReveal()) {
        return;
      }
      attemptsRemaining -= 1;
      if (attemptsRemaining <= 0) {
        args.completeAnchorNavigationRestore(activeNodeId, 'anchor-reveal-timeout');
        args.clearPendingAnchor();
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
  }, [args]);
}

export function usePendingAnchorNavigation(args: {
  activeNodeContent: string | null;
  activeNodeId: string | null;
  beginAnchorNavigationRestore: (nodeId: string, selection: EditorSelection) => void;
  completeAnchorNavigationRestore: (nodeId: string, reason: string) => void;
}) {
  const [pendingAnchorNodeId, setPendingAnchorNodeId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const restoreSuppression = useRestoreSuppressionController(args.activeNodeId);
  const clearPendingAnchor = useCallback(() => {
    setPendingAnchorNodeId(null);
    setPendingAnchor(null);
  }, []);
  const applyNavigationResult = useCallback((result: NodeNavigationResult | null) => {
    if (!result) {
      restoreSuppression.releaseRestoreSuppression();
      return;
    }
    const pendingSelection = resolveAnchorRestoreSelection(result.focusAnchor);
    if (pendingSelection) {
      args.beginAnchorNavigationRestore(result.nodeId, pendingSelection);
    }
    setPendingAnchorNodeId(result.nodeId);
    setPendingAnchor(result.focusAnchor);
    restoreSuppression.setSuppressedRestoreNodeId(result.focusAnchor ? result.nodeId : null);
  }, [args, restoreSuppression]);
  usePendingAnchorReveal({
    activeNodeContent: args.activeNodeContent,
    activeNodeId: args.activeNodeId,
    beginAnchorNavigationRestore: args.beginAnchorNavigationRestore,
    clearPendingAnchor,
    completeAnchorNavigationRestore: args.completeAnchorNavigationRestore,
    pendingAnchor,
    pendingAnchorNodeId,
    scheduleRestoreSuppressionRelease: restoreSuppression.scheduleRestoreSuppressionRelease
  });
  useEffect(() => {
    if (!pendingAnchorNodeId || pendingAnchorNodeId === args.activeNodeId) {
      return;
    }
    args.completeAnchorNavigationRestore(pendingAnchorNodeId, 'anchor-node-mismatch');
    clearPendingAnchor();
  }, [args.activeNodeId, args.completeAnchorNavigationRestore, clearPendingAnchor, pendingAnchorNodeId]);
  const shouldSuppressSelectionRestore = useCallback(
    () =>
      Boolean(
        args.activeNodeId &&
          ((pendingAnchorNodeId === args.activeNodeId && pendingAnchor) ||
            restoreSuppression.suppressedRestoreNodeId === args.activeNodeId)
      ),
    [args.activeNodeId, pendingAnchor, pendingAnchorNodeId, restoreSuppression.suppressedRestoreNodeId]
  );
  return { applyNavigationResult, shouldSuppressSelectionRestore };
}

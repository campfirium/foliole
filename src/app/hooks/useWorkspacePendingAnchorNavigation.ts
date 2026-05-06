import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isPdfAnchorLocator,
  type NodeAnchorLink
} from '../../features/nodes/model/nodeTypes';
import { requestPdfAnchorJump } from '../../features/pdf/model/pdfSystemRegistry';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import type { NodeViewState } from '../../store/workspaceStore';

type PendingAnchor = NodeAnchorLink;

function revealPendingAnchor(args: {
  activeNodeId: string;
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
  return false;
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
  activeNodeId: string | null;
  clearPendingAnchor: () => void;
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
    const tryReveal = () => revealPendingAnchor({
      activeNodeId,
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
  applyNavigationReadingPosition: (result: NodeNavigationResult | null) => boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
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
      clearPendingAnchor();
      restoreSuppression.releaseRestoreSuppression();
      return;
    }
    if (args.applyNavigationReadingPosition(result)) {
      clearPendingAnchor();
      restoreSuppression.releaseRestoreSuppression();
      return;
    }
    setPendingAnchorNodeId(result.nodeId);
    setPendingAnchor(result.focusAnchor);
    restoreSuppression.setSuppressedRestoreNodeId(result.focusAnchor ? result.nodeId : null);
  }, [args, clearPendingAnchor, restoreSuppression]);
  usePendingAnchorReveal({
    activeNodeId: args.activeNodeId,
    clearPendingAnchor,
    pendingAnchor,
    pendingAnchorNodeId,
    scheduleRestoreSuppressionRelease: restoreSuppression.scheduleRestoreSuppressionRelease
  });
  useEffect(() => {
    if (!pendingAnchorNodeId || pendingAnchorNodeId === args.activeNodeId) {
      return;
    }
    clearPendingAnchor();
  }, [args.activeNodeId, clearPendingAnchor, pendingAnchorNodeId]);
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

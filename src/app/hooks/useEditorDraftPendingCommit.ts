import { useCallback, useRef, type MutableRefObject } from 'react';

export interface PendingDraftCommit {
  committedContent: string | null;
  content: string;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string) => void;
}

export interface PendingTitleRefresh {
  content: string;
  nodeId: string;
}

export interface DraftFlushResult {
  flushed: boolean;
  pendingTitle: PendingTitleRefresh | null;
}

export function clearDraftTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function runPendingTitleRefresh(
  flushResult: { pendingTitle: PendingTitleRefresh | null },
  onFinalizeNode: ((nodeId: string, content: string) => void) | undefined
) {
  const pendingTitle = flushResult.pendingTitle;
  if (pendingTitle) {
    onFinalizeNode?.(pendingTitle.nodeId, pendingTitle.content);
  }
}

export function usePendingDraftCommit(timerRef: MutableRefObject<number | null>) {
  const pendingCommitRef = useRef<PendingDraftCommit | null>(null);
  const pendingTitleRefreshRef = useRef<PendingTitleRefresh | null>(null);
  const finalizeTitleRefresh = useCallback((nodeId?: string | null) => {
    const pendingTitle = pendingTitleRefreshRef.current;
    if (!pendingTitle || (nodeId && pendingTitle.nodeId !== nodeId)) {
      return null;
    }
    pendingTitleRefreshRef.current = null;
    return pendingTitle;
  }, []);
  const flushDraft = useCallback((finalizeTitle = false): DraftFlushResult => {
    clearDraftTimer(timerRef);
    const pendingCommit = pendingCommitRef.current;
    pendingCommitRef.current = null;
    const pendingTitle = finalizeTitle ? finalizeTitleRefresh(pendingCommit?.nodeId) : null;
    if (!pendingCommit || pendingCommit.content === pendingCommit.committedContent) {
      return { flushed: false, pendingTitle };
    }
    pendingCommit.onCommit(pendingCommit.nodeId, pendingCommit.content);
    return { flushed: true, pendingTitle: pendingTitle ?? finalizeTitleRefresh(pendingCommit.nodeId) };
  }, [finalizeTitleRefresh, timerRef]);
  const clearPendingDraftCommit = useCallback(() => {
    pendingCommitRef.current = null;
  }, []);
  const setPendingDraftCommit = useCallback((pendingCommit: PendingDraftCommit) => {
    pendingCommitRef.current = pendingCommit;
  }, []);
  const getPendingDraftCommit = useCallback(() => pendingCommitRef.current, []);
  const setPendingTitleRefresh = useCallback((pendingTitle: PendingTitleRefresh) => {
    pendingTitleRefreshRef.current = pendingTitle;
  }, []);
  const flushPendingDraftForDifferentNode = useCallback((nodeId: string): DraftFlushResult => {
    if (pendingCommitRef.current && pendingCommitRef.current.nodeId !== nodeId) {
      return flushDraft(true);
    }
    const pendingTitle = pendingTitleRefreshRef.current;
    if (pendingTitle && pendingTitle.nodeId !== nodeId) {
      return { flushed: false, pendingTitle: finalizeTitleRefresh(pendingTitle.nodeId) };
    }
    return { flushed: false, pendingTitle: null };
  }, [finalizeTitleRefresh, flushDraft]);

  return {
    clearPendingDraftCommit,
    flushDraft,
    flushPendingDraftForDifferentNode,
    getPendingDraftCommit,
    setPendingDraftCommit,
    setPendingTitleRefresh
  };
}

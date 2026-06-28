import { startTransition, useCallback, useRef, type MutableRefObject } from 'react';

import {
  isEditorInputDiagnosticEnabled,
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from '../../store/workspaceEditorInputDiagnostics';

export interface PendingDraftCommit {
  committedContent: string | null;
  content: string;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string, options?: { publishLocal?: boolean }) => void;
}

export interface PendingTitleRefresh {
  content: string;
  nodeId: string;
}

export interface DraftFlushResult {
  flushed: boolean;
  pendingTitle: PendingTitleRefresh | null;
}

interface FlushPendingDraftArgs {
  finalizeTitle: boolean;
  finalizeTitleRefresh: (nodeId?: string | null) => PendingTitleRefresh | null;
  pendingCommitRef: MutableRefObject<PendingDraftCommit | null>;
  pendingCommitStartedAtRef: MutableRefObject<number | null>;
  timerRef: MutableRefObject<number | null>;
}

interface FlushFreshDraftArgs {
  committedContent: string | null;
  content: string;
  finalizeTitle: boolean;
  finalizeTitleRefresh: (nodeId?: string | null) => PendingTitleRefresh | null;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string, options?: { publishLocal?: boolean }) => void;
  pendingCommitRef: MutableRefObject<PendingDraftCommit | null>;
  pendingCommitStartedAtRef: MutableRefObject<number | null>;
  timerRef: MutableRefObject<number | null>;
}

export function clearDraftTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function logDraftFlushDiagnostic(args: {
  contentLength?: number;
  finalizeTitle: boolean;
  flushed: boolean;
  flushStartedAt: number;
  pendingAgeMs: number | null;
}) {
  logEditorInputDiagnostic('draft-flush', {
    contentLength: args.contentLength,
    finalizeTitle: args.finalizeTitle,
    flushed: args.flushed,
    pendingAgeMs: args.pendingAgeMs,
    totalMs: readEditorInputDiagnosticTime() - args.flushStartedAt
  });
}

function flushPendingDraft(args: FlushPendingDraftArgs): DraftFlushResult {
  const diagnosticsEnabled = isEditorInputDiagnosticEnabled();
  const flushStartedAt = diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const pendingAgeMs = args.pendingCommitStartedAtRef.current === null
    ? null
    : readEditorInputDiagnosticTime() - args.pendingCommitStartedAtRef.current;
  clearDraftTimer(args.timerRef);
  const pendingCommit = args.pendingCommitRef.current;
  args.pendingCommitRef.current = null;
  args.pendingCommitStartedAtRef.current = null;
  const pendingTitle = args.finalizeTitle ? args.finalizeTitleRefresh(pendingCommit?.nodeId) : null;
  if (!pendingCommit || pendingCommit.content === pendingCommit.committedContent) {
    if (diagnosticsEnabled) {
      logDraftFlushDiagnostic({
        ...(pendingCommit ? { contentLength: pendingCommit.content.length } : {}),
        finalizeTitle: args.finalizeTitle,
        flushed: false,
        flushStartedAt,
        pendingAgeMs
      });
    }
    return { flushed: false, pendingTitle };
  }
  const commitPendingDraft = (options?: { publishLocal?: boolean }) =>
    pendingCommit.onCommit(pendingCommit.nodeId, pendingCommit.content, options);
  if (args.finalizeTitle) {
    commitPendingDraft({ publishLocal: false });
  } else {
    startTransition(() => commitPendingDraft({ publishLocal: false }));
  }
  if (diagnosticsEnabled) {
    logDraftFlushDiagnostic({
      contentLength: pendingCommit.content.length,
      finalizeTitle: args.finalizeTitle,
      flushed: true,
      flushStartedAt,
      pendingAgeMs
    });
  }
  return { flushed: true, pendingTitle: pendingTitle ?? args.finalizeTitleRefresh(pendingCommit.nodeId) };
}

function clearPendingCommitForNode(args: {
  nodeId: string | null;
  pendingCommitRef: MutableRefObject<PendingDraftCommit | null>;
  pendingCommitStartedAtRef: MutableRefObject<number | null>;
}) {
  if (!args.pendingCommitRef.current || args.pendingCommitRef.current.nodeId !== args.nodeId) {
    return;
  }
  args.pendingCommitRef.current = null;
  args.pendingCommitStartedAtRef.current = null;
}

function flushFreshDraft(args: FlushFreshDraftArgs): DraftFlushResult {
  clearDraftTimer(args.timerRef);
  clearPendingCommitForNode(args);
  const pendingTitle = args.finalizeTitle ? args.finalizeTitleRefresh(args.nodeId) : null;
  if (!args.nodeId || args.content === args.committedContent) {
    return { flushed: false, pendingTitle };
  }
  args.onCommit(args.nodeId, args.content);
  return { flushed: true, pendingTitle: pendingTitle ?? args.finalizeTitleRefresh(args.nodeId) };
}

function useFreshDraftFlush(args: {
  finalizeTitleRefresh: (nodeId?: string | null) => PendingTitleRefresh | null;
  pendingCommitRef: MutableRefObject<PendingDraftCommit | null>;
  pendingCommitStartedAtRef: MutableRefObject<number | null>;
  timerRef: MutableRefObject<number | null>;
}) {
  const { finalizeTitleRefresh, pendingCommitRef, pendingCommitStartedAtRef, timerRef } = args;
  return useCallback((freshArgs: {
    committedContent: string | null;
    content: string;
    finalizeTitle?: boolean;
    nodeId: string | null;
    onCommit: PendingDraftCommit['onCommit'];
  }): DraftFlushResult => {
    return flushFreshDraft({
      ...freshArgs,
      finalizeTitle: freshArgs.finalizeTitle ?? true,
      finalizeTitleRefresh,
      pendingCommitRef,
      pendingCommitStartedAtRef,
      timerRef
    });
  }, [finalizeTitleRefresh, pendingCommitRef, pendingCommitStartedAtRef, timerRef]);
}

export function runPendingTitleRefresh(
  flushResult: { pendingTitle: PendingTitleRefresh | null },
  onFinalizeNode: ((nodeId: string, content: string) => unknown) | undefined
) {
  const pendingTitle = flushResult.pendingTitle;
  if (pendingTitle) {
    try {
      const result = onFinalizeNode?.(pendingTitle.nodeId, pendingTitle.content);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => undefined);
      }
    } catch {
      // Title derivation must not undo or block a completed body commit.
    }
  }
}

export function usePendingDraftCommit(timerRef: MutableRefObject<number | null>) {
  const pendingCommitRef = useRef<PendingDraftCommit | null>(null);
  const pendingCommitStartedAtRef = useRef<number | null>(null);
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
    return flushPendingDraft({
      finalizeTitle,
      finalizeTitleRefresh,
      pendingCommitRef,
      pendingCommitStartedAtRef,
      timerRef
    });
  }, [finalizeTitleRefresh, timerRef]);
  const flushFreshDraftForNode = useFreshDraftFlush({
    finalizeTitleRefresh,
    pendingCommitRef,
    pendingCommitStartedAtRef,
    timerRef
  });
  const clearPendingDraftCommit = useCallback(() => {
    pendingCommitRef.current = null;
    pendingCommitStartedAtRef.current = null;
  }, []);
  const setPendingDraftCommit = useCallback((pendingCommit: PendingDraftCommit) => {
    pendingCommitRef.current = pendingCommit;
    pendingCommitStartedAtRef.current = readEditorInputDiagnosticTime();
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
    flushFreshDraftForNode,
    flushPendingDraftForDifferentNode,
    getPendingDraftCommit,
    setPendingDraftCommit,
    setPendingTitleRefresh
  };
}

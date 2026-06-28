import { useCallback, useEffect, type MutableRefObject } from 'react';

import {
  clearDraftTimer,
  runPendingTitleRefresh,
  usePendingDraftCommit
} from './useEditorDraftPendingCommit';

const EDITOR_DRAFT_FLUSH_DEBOUNCE_MS = 1200;

export type EditorDraftCommit = (
  nodeId: string | null,
  content: string,
  options?: { publishLocal?: boolean }
) => void;

export type EditorDraftFlushRegistration = (
  flush: (() => boolean) | null,
  closeFlush: (() => Promise<boolean>) | null,
  freshFlush?: ((sourceNodeId: string | null, content: string) => boolean) | null
) => void;

interface DraftFlushCallbacksArgs {
  clearFreshDraftEvidence: (nodeId: string | null) => void;
  flushDraft: ReturnType<typeof usePendingDraftCommit>['flushDraft'];
  flushFreshDraftForNode: ReturnType<typeof usePendingDraftCommit>['flushFreshDraftForNode'];
  hasFreshDraftEvidence: (nodeId: string | null, content: string) => boolean;
  latestCommittedContentRef: MutableRefObject<string>;
  nodeId: string | null;
  onCommit: EditorDraftCommit;
  onFinalizeNode: ((nodeId: string, content: string) => unknown) | undefined;
  onRegisterFlush: EditorDraftFlushRegistration | undefined;
  timerRef: MutableRefObject<number | null>;
}

function useFreshDraftFlushCallback(args: DraftFlushCallbacksArgs) {
  return useCallback((sourceNodeId: string | null, content: string) => {
    const effectiveNodeId = sourceNodeId ?? args.nodeId;
    if (!effectiveNodeId || !args.hasFreshDraftEvidence(effectiveNodeId, content)) {
      return false;
    }
    const committedContent = effectiveNodeId === args.nodeId ? args.latestCommittedContentRef.current : null;
    const result = args.flushFreshDraftForNode({
      committedContent,
      content,
      nodeId: effectiveNodeId,
      onCommit: args.onCommit
    });
    args.clearFreshDraftEvidence(effectiveNodeId);
    runPendingTitleRefresh(result, args.onFinalizeNode);
    return result.flushed;
  }, [args]);
}

export function useDraftFlushCallbacks(args: DraftFlushCallbacksArgs) {
  const { flushDraft, onFinalizeNode, onRegisterFlush, timerRef } = args;
  const flushDraftAndFinalize = useCallback(() => {
    const result = flushDraft(true);
    runPendingTitleRefresh(result, onFinalizeNode);
    return result.flushed;
  }, [flushDraft, onFinalizeNode]);
  const flushFreshDraftAndFinalize = useFreshDraftFlushCallback(args);
  const flushDraftImmediately = useCallback(async () => {
    flushDraftAndFinalize();
    return true;
  }, [flushDraftAndFinalize]);
  const scheduleFlush = useCallback(() => {
    clearDraftTimer(timerRef);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flushDraft(false);
    }, EDITOR_DRAFT_FLUSH_DEBOUNCE_MS);
  }, [flushDraft, timerRef]);

  useEffect(() => () => {
    flushDraftAndFinalize();
    clearDraftTimer(timerRef);
  }, [flushDraftAndFinalize, timerRef]);

  useEffect(() => {
    onRegisterFlush?.(flushDraftAndFinalize, flushDraftImmediately, flushFreshDraftAndFinalize);
    return () => {
      onRegisterFlush?.(null, null);
    };
  }, [flushDraftAndFinalize, flushDraftImmediately, flushFreshDraftAndFinalize, onRegisterFlush]);

  return { scheduleFlush };
}

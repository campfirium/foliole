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

export function useDraftFlushCallbacks(args: {
  flushDraft: ReturnType<typeof usePendingDraftCommit>['flushDraft'];
  flushFreshDraftForNode: ReturnType<typeof usePendingDraftCommit>['flushFreshDraftForNode'];
  latestCommittedContentRef: MutableRefObject<string>;
  nodeId: string | null;
  onCommit: EditorDraftCommit;
  onFinalizeNode: ((nodeId: string, content: string) => void) | undefined;
  onRegisterFlush: EditorDraftFlushRegistration | undefined;
  timerRef: MutableRefObject<number | null>;
}) {
  const {
    flushDraft,
    flushFreshDraftForNode,
    latestCommittedContentRef,
    nodeId,
    onCommit,
    onFinalizeNode,
    onRegisterFlush,
    timerRef
  } = args;
  const flushDraftAndFinalize = useCallback(() => {
    const result = flushDraft(true);
    runPendingTitleRefresh(result, onFinalizeNode);
    return result.flushed;
  }, [flushDraft, onFinalizeNode]);
  const flushFreshDraftAndFinalize = useCallback((sourceNodeId: string | null, content: string) => {
    const effectiveNodeId = sourceNodeId ?? nodeId;
    const committedContent = effectiveNodeId === nodeId ? latestCommittedContentRef.current : null;
    const result = flushFreshDraftForNode({
      committedContent,
      content,
      nodeId: effectiveNodeId,
      onCommit
    });
    runPendingTitleRefresh(result, onFinalizeNode);
    return result.flushed;
  }, [flushFreshDraftForNode, latestCommittedContentRef, nodeId, onCommit, onFinalizeNode]);
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

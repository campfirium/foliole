import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

const EDITOR_DRAFT_FLUSH_DEBOUNCE_MS = 400;

interface UseEditorDraftSyncArgs {
  committedContent: string;
  nodeId: string | null;
  onCommit: (content: string) => void;
  onRegisterFlush?: (flush: (() => boolean) | null, closeFlush: (() => Promise<boolean>) | null) => void;
}

declare global {
  interface Window {
    __folioleFlushPendingEditorDraftBeforeClose?: () => Promise<boolean>;
  }
}

function clearDraftTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function useEditorDraftState(committedContent: string, nodeId: string | null) {
  const [draftState, setDraftState] = useState(() => ({
    content: committedContent,
    nodeId
  }));
  const latestCommittedContentRef = useRef(committedContent);
  const latestDraftContentRef = useRef(committedContent);
  const latestDraftNodeIdRef = useRef(nodeId);

  latestCommittedContentRef.current = committedContent;
  latestDraftContentRef.current = draftState.content;
  latestDraftNodeIdRef.current = draftState.nodeId;

  return {
    draftState,
    latestCommittedContentRef,
    latestDraftContentRef,
    latestDraftNodeIdRef,
    setDraftState
  };
}

export function useEditorDraftSync(args: UseEditorDraftSyncArgs) {
  const { committedContent, nodeId, onCommit, onRegisterFlush } = args;
  const { draftState, latestCommittedContentRef, latestDraftContentRef, setDraftState } = useEditorDraftState(
    committedContent,
    nodeId
  );
  const timerRef = useRef<number | null>(null);

  const flushDraft = useCallback(() => {
    clearDraftTimer(timerRef);
    if (latestDraftContentRef.current === latestCommittedContentRef.current) {
      return false;
    }
    onCommit(latestDraftContentRef.current);
    return true;
  }, [onCommit]);

  const flushDraftImmediately = useCallback(async () => {
    flushDraft();
    return true;
  }, [flushDraft]);

  const scheduleFlush = useCallback(() => {
    clearDraftTimer(timerRef);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flushDraft();
    }, EDITOR_DRAFT_FLUSH_DEBOUNCE_MS);
  }, [flushDraft]);

  const handleEditorChange = useCallback((content: string) => {
    if (!nodeId) {
      onCommit(content);
      return;
    }
    setDraftState({ content, nodeId });
    if (content === latestCommittedContentRef.current) {
      clearDraftTimer(timerRef);
      return;
    }
    scheduleFlush();
  }, [nodeId, onCommit, scheduleFlush]);

  const editorContent = useMemo(
    () => (nodeId && draftState.nodeId === nodeId ? draftState.content : committedContent),
    [committedContent, draftState.content, draftState.nodeId, nodeId]
  );

  useEffect(() => {
    if (nodeId) {
      setDraftState({ content: committedContent, nodeId });
    }
  }, [committedContent, nodeId]);

  useEffect(() => () => clearDraftTimer(timerRef), []);

  useEffect(() => {
    onRegisterFlush?.(flushDraft, flushDraftImmediately);
    return () => {
      onRegisterFlush?.(null, null);
    };
  }, [flushDraft, flushDraftImmediately, onRegisterFlush]);

  return { editorContent, handleEditorChange };
}

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

const EDITOR_DRAFT_FLUSH_DEBOUNCE_MS = 400;

interface UseEditorDraftSyncArgs {
  committedContent: string;
  nodeId: string | null;
  onCommit: (content: string) => void;
  onRegisterFlush?: (flush: (() => boolean) | null, closeFlush: (() => Promise<boolean>) | null) => void;
}

interface PendingDraftCommit {
  committedContent: string;
  content: string;
  nodeId: string;
  onCommit: (content: string) => void;
}

interface EditorDraftState {
  content: string;
  nodeId: string | null;
}

interface DraftChangeHandlerArgs {
  clearPendingDraftCommit: () => void;
  latestCommittedContentRef: MutableRefObject<string>;
  nodeId: string | null;
  onCommit: (content: string) => void;
  scheduleFlush: () => void;
  setDraftState: Dispatch<SetStateAction<EditorDraftState>>;
  setPendingDraftCommit: (pendingCommit: PendingDraftCommit) => void;
  timerRef: MutableRefObject<number | null>;
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

function usePendingDraftCommit(timerRef: MutableRefObject<number | null>) {
  const pendingCommitRef = useRef<PendingDraftCommit | null>(null);
  const flushDraft = useCallback(() => {
    clearDraftTimer(timerRef);
    const pendingCommit = pendingCommitRef.current;
    pendingCommitRef.current = null;
    if (!pendingCommit || pendingCommit.content === pendingCommit.committedContent) {
      return false;
    }
    pendingCommit.onCommit(pendingCommit.content);
    return true;
  }, [timerRef]);
  const clearPendingDraftCommit = useCallback(() => {
    pendingCommitRef.current = null;
  }, []);
  const setPendingDraftCommit = useCallback((pendingCommit: PendingDraftCommit) => {
    pendingCommitRef.current = pendingCommit;
  }, []);
  const flushPendingDraftForDifferentNode = useCallback((nodeId: string) => {
    if (pendingCommitRef.current && pendingCommitRef.current.nodeId !== nodeId) {
      flushDraft();
    }
  }, [flushDraft]);

  return { clearPendingDraftCommit, flushDraft, flushPendingDraftForDifferentNode, setPendingDraftCommit };
}

function useDraftChangeHandler(args: DraftChangeHandlerArgs) {
  return useCallback((content: string) => {
    if (!args.nodeId) {
      args.onCommit(content);
      return;
    }
    args.setDraftState({ content, nodeId: args.nodeId });
    if (content === args.latestCommittedContentRef.current) {
      clearDraftTimer(args.timerRef);
      args.clearPendingDraftCommit();
      return;
    }
    args.setPendingDraftCommit({
      committedContent: args.latestCommittedContentRef.current,
      content,
      nodeId: args.nodeId,
      onCommit: args.onCommit
    });
    args.scheduleFlush();
  }, [args]);
}

export function useEditorDraftSync(args: UseEditorDraftSyncArgs) {
  const { committedContent, nodeId, onCommit, onRegisterFlush } = args;
  const { draftState, latestCommittedContentRef, setDraftState } = useEditorDraftState(
    committedContent,
    nodeId
  );
  const timerRef = useRef<number | null>(null);
  const {
    clearPendingDraftCommit,
    flushDraft,
    flushPendingDraftForDifferentNode,
    setPendingDraftCommit
  } = usePendingDraftCommit(timerRef);

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

  const handleEditorChange = useDraftChangeHandler({
    clearPendingDraftCommit,
    latestCommittedContentRef,
    nodeId,
    onCommit,
    scheduleFlush,
    setDraftState,
    setPendingDraftCommit,
    timerRef
  });

  const editorContent = useMemo(
    () => (nodeId && draftState.nodeId === nodeId ? draftState.content : committedContent),
    [committedContent, draftState.content, draftState.nodeId, nodeId]
  );

  useEffect(() => {
    if (nodeId) {
      flushPendingDraftForDifferentNode(nodeId);
      setDraftState({ content: committedContent, nodeId });
    }
  }, [committedContent, flushPendingDraftForDifferentNode, nodeId, setDraftState]);

  useEffect(() => () => clearDraftTimer(timerRef), []);

  useEffect(() => {
    onRegisterFlush?.(flushDraft, flushDraftImmediately);
    return () => {
      onRegisterFlush?.(null, null);
    };
  }, [flushDraft, flushDraftImmediately, onRegisterFlush]);

  return { editorContent, handleEditorChange };
}

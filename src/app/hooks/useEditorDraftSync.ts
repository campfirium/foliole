import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';

const EDITOR_DRAFT_FLUSH_DEBOUNCE_MS = 400;

interface UseEditorDraftSyncArgs {
  committedContent: string;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string) => void;
  onRegisterFlush?: (flush: (() => boolean) | null, closeFlush: (() => Promise<boolean>) | null) => void;
}

interface PendingDraftCommit {
  committedContent: string | null;
  content: string;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string) => void;
}

interface EditorDraftState {
  content: string;
  nodeId: string | null;
}

interface DraftChangeHandlerArgs {
  clearPendingDraftCommit: () => void;
  latestCommittedContentRef: MutableRefObject<string>;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string) => void;
  scheduleFlush: () => void;
  setDraftState: Dispatch<SetStateAction<EditorDraftState>>;
  setPendingDraftCommit: (pendingCommit: PendingDraftCommit) => void;
  timerRef: MutableRefObject<number | null>;
}

interface CommittedContentSyncArgs {
  clearPendingDraftCommit: () => void;
  committedContent: string;
  draftState: EditorDraftState;
  flushPendingDraftForDifferentNode: (nodeId: string) => void;
  getPendingDraftCommit: () => PendingDraftCommit | null;
  nodeId: string | null;
  setDraftState: Dispatch<SetStateAction<EditorDraftState>>;
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
    pendingCommit.onCommit(pendingCommit.nodeId, pendingCommit.content);
    return true;
  }, [timerRef]);
  const clearPendingDraftCommit = useCallback(() => {
    pendingCommitRef.current = null;
  }, []);
  const setPendingDraftCommit = useCallback((pendingCommit: PendingDraftCommit) => {
    pendingCommitRef.current = pendingCommit;
  }, []);
  const getPendingDraftCommit = useCallback(() => pendingCommitRef.current, []);
  const flushPendingDraftForDifferentNode = useCallback((nodeId: string) => {
    if (pendingCommitRef.current && pendingCommitRef.current.nodeId !== nodeId) {
      flushDraft();
    }
  }, [flushDraft]);

  return { clearPendingDraftCommit, flushDraft, flushPendingDraftForDifferentNode, getPendingDraftCommit, setPendingDraftCommit };
}

function useDraftChangeHandler(args: DraftChangeHandlerArgs) {
  return useCallback((content: string, meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? args.nodeId;
    if (!sourceNodeId) {
      args.onCommit(null, content);
      return;
    }
    const committedContent = sourceNodeId === args.nodeId ? args.latestCommittedContentRef.current : null;
    if (sourceNodeId === args.nodeId) {
      args.setDraftState({ content, nodeId: sourceNodeId });
    }
    if (committedContent !== null && content === committedContent) {
      clearDraftTimer(args.timerRef);
      args.clearPendingDraftCommit();
      return;
    }
    args.setPendingDraftCommit({
      committedContent,
      content,
      nodeId: sourceNodeId,
      onCommit: args.onCommit
    });
    args.scheduleFlush();
  }, [
    args.clearPendingDraftCommit,
    args.latestCommittedContentRef,
    args.nodeId,
    args.onCommit,
    args.scheduleFlush,
    args.setDraftState,
    args.setPendingDraftCommit,
    args.timerRef
  ]);
}

function useCommittedContentSync(args: CommittedContentSyncArgs) {
  useEffect(() => {
    if (!args.nodeId) {
      return;
    }
    args.flushPendingDraftForDifferentNode(args.nodeId);
    const pendingCommit = args.getPendingDraftCommit();
    if (pendingCommit?.nodeId === args.nodeId) {
      if (pendingCommit.content === args.committedContent) {
        args.clearPendingDraftCommit();
        if (args.draftState.content !== args.committedContent || args.draftState.nodeId !== args.nodeId) {
          args.setDraftState({ content: args.committedContent, nodeId: args.nodeId });
        }
      }
      return;
    }
    if (args.draftState.content === args.committedContent && args.draftState.nodeId === args.nodeId) {
      return;
    }
    args.setDraftState({ content: args.committedContent, nodeId: args.nodeId });
  }, [
    args.clearPendingDraftCommit,
    args.committedContent,
    args.draftState.content,
    args.draftState.nodeId,
    args.flushPendingDraftForDifferentNode,
    args.getPendingDraftCommit,
    args.nodeId,
    args.setDraftState
  ]);
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
    getPendingDraftCommit,
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

  useCommittedContentSync({
    clearPendingDraftCommit,
    committedContent,
    draftState,
    flushPendingDraftForDifferentNode,
    getPendingDraftCommit,
    nodeId,
    setDraftState
  });

  useEffect(() => () => {
    flushDraft();
    clearDraftTimer(timerRef);
  }, [flushDraft]);

  useEffect(() => {
    onRegisterFlush?.(flushDraft, flushDraftImmediately);
    return () => {
      onRegisterFlush?.(null, null);
    };
  }, [flushDraft, flushDraftImmediately, onRegisterFlush]);

  return { editorContent, handleEditorChange };
}

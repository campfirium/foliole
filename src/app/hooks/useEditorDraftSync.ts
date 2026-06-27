import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { deferNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

import { useDraftFlushCallbacks, type EditorDraftCommit, type EditorDraftFlushRegistration } from './useEditorDraftFlushCallbacks';
import { useEditorDraftInputHandler } from './useEditorDraftInputHandler';
import {
  clearDraftTimer,
  runPendingTitleRefresh,
  usePendingDraftCommit,
  type DraftFlushResult,
  type PendingDraftCommit,
  type PendingTitleRefresh
} from './useEditorDraftPendingCommit';

interface UseEditorDraftSyncArgs {
  committedContent: string;
  nodeId: string | null;
  onCommit: EditorDraftCommit;
  onFinalizeNode?: (nodeId: string, content: string) => void;
  onRegisterFlush?: EditorDraftFlushRegistration;
}

interface EditorDraftState {
  content: string;
  nodeId: string | null;
}

interface DraftChangeHandlerArgs {
  clearPendingDraftCommit: () => void;
  latestCommittedContentRef: MutableRefObject<string>;
  nodeId: string | null;
  onCommit: (nodeId: string | null, content: string, options?: { publishLocal?: boolean }) => void;
  scheduleFlush: () => void;
  setDraftState: Dispatch<SetStateAction<EditorDraftState>>;
  setPendingDraftCommit: (pendingCommit: PendingDraftCommit) => void;
  setPendingTitleRefresh: (pendingTitle: PendingTitleRefresh) => void;
  timerRef: MutableRefObject<number | null>;
}

interface CommittedContentSyncArgs {
  clearPendingDraftCommit: () => void;
  committedContent: string;
  draftState: EditorDraftState;
  flushPendingDraftForDifferentNode: (nodeId: string) => DraftFlushResult;
  getPendingDraftCommit: () => PendingDraftCommit | null;
  nodeId: string | null;
  onFinalizeNode: ((nodeId: string, content: string) => void) | undefined;
  setDraftState: Dispatch<SetStateAction<EditorDraftState>>;
}

declare global {
  interface Window {
    __folioleFlushPendingEditorDraftBeforeClose?: () => Promise<boolean>;
  }
}

function useEditorDraftState(committedContent: string, nodeId: string | null) {
  const [draftState, setDraftState] = useState(() => ({
    content: committedContent,
    nodeId
  }));
  const latestCommittedContentRef = useRef(committedContent);

  latestCommittedContentRef.current = committedContent;

  return {
    draftState,
    latestCommittedContentRef,
    setDraftState
  };
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
      startTransition(() => {
        args.setDraftState({ content, nodeId: sourceNodeId });
      });
    }
    deferNodeContentRuntimePersist(sourceNodeId);
    args.setPendingTitleRefresh({ content, nodeId: sourceNodeId });
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
    args.setPendingTitleRefresh,
    args.timerRef
  ]);
}

function useCommittedContentSync(args: CommittedContentSyncArgs) {
  useEffect(() => {
    if (!args.nodeId) {
      return;
    }
    runPendingTitleRefresh(args.flushPendingDraftForDifferentNode(args.nodeId), args.onFinalizeNode);
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
    args.onFinalizeNode,
    args.setDraftState
  ]);
}

export function useEditorDraftSync(args: UseEditorDraftSyncArgs) {
  const { committedContent, nodeId, onCommit, onFinalizeNode, onRegisterFlush } = args;
  const { draftState, latestCommittedContentRef, setDraftState } = useEditorDraftState(
    committedContent,
    nodeId
  );
  const timerRef = useRef<number | null>(null);
  const {
    clearPendingDraftCommit,
    flushDraft,
    flushFreshDraftForNode,
    flushPendingDraftForDifferentNode,
    getPendingDraftCommit,
    setPendingDraftCommit,
    setPendingTitleRefresh
  } = usePendingDraftCommit(timerRef);

  const { scheduleFlush } = useDraftFlushCallbacks({
    flushDraft,
    flushFreshDraftForNode,
    latestCommittedContentRef,
    nodeId,
    onCommit,
    onFinalizeNode,
    onRegisterFlush,
    timerRef
  });

  const handleEditorChange = useDraftChangeHandler({
    clearPendingDraftCommit,
    latestCommittedContentRef,
    nodeId,
    onCommit,
    scheduleFlush,
    setDraftState,
    setPendingDraftCommit,
    setPendingTitleRefresh,
    timerRef
  });
  const handleEditorInput = useEditorDraftInputHandler(nodeId, () => getPendingDraftCommit() && scheduleFlush());

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
    onFinalizeNode,
    setDraftState
  });

  return { editorContent, flushDraft: () => flushDraft(false).flushed, handleEditorChange, handleEditorInput };
}

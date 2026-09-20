import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';


import { useDraftChangeHandler } from './useDraftChangeHandler';
import {
  useDraftFlushCallbacks,
  type EditorDraftCommit,
  type EditorDraftFlushRegistration
} from './useEditorDraftFlushCallbacks';
import { useEditorDraftInputWithEvidence } from './useEditorDraftInputWithEvidence';
import {
  runPendingTitleRefresh,
  usePendingDraftCommit,
  type DraftFlushResult,
  type PendingDraftCommit
} from './useEditorDraftPendingCommit';
import { createEditorDraftSyncApi } from './useEditorDraftSyncApi';
import { useEditorDraftUserInputEvidence } from './useEditorDraftUserInputEvidence';

interface UseEditorDraftSyncArgs {
  committedContent: string;
  committedVersionId?: string | null | undefined;
  nodeId: string | null;
  onCommit: EditorDraftCommit;
  onFinalizeNode?: (nodeId: string, content: string) => void;
  onRegisterFlush?: EditorDraftFlushRegistration;
}

interface EditorDraftState {
  content: string;
  nodeId: string | null;
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

function useEditorContent(nodeId: string | null, draftState: EditorDraftState, committedContent: string) {
  return useMemo(
    () => (nodeId && draftState.nodeId === nodeId ? draftState.content : committedContent),
    [committedContent, draftState.content, draftState.nodeId, nodeId]
  );
}

export function useEditorDraftSync(args: UseEditorDraftSyncArgs) {
  const { committedContent, nodeId, onCommit, onFinalizeNode, onRegisterFlush } = args;
  const { draftState, latestCommittedContentRef, setDraftState } = useEditorDraftState(committedContent, nodeId);
  const timerRef = useRef<number | null>(null);
  const pending = usePendingDraftCommit(timerRef);
  const { getPendingDraftCommit, flushDraft } = pending;
  const userInputEvidence = useEditorDraftUserInputEvidence(getPendingDraftCommit);

  const { scheduleFlush } = useDraftFlushCallbacks({
    committedVersionId: args.committedVersionId,
    clearFreshDraftEvidence: userInputEvidence.clearPendingUserInputEvidence,
    flushDraft,
    flushFreshDraftForNode: pending.flushFreshDraftForNode,
    hasFreshDraftEvidence: userInputEvidence.hasFreshDraftEvidence,
    latestCommittedContentRef,
    nodeId,
    onCommit,
    onFinalizeNode,
    onRegisterFlush,
    timerRef
  });

  const handleEditorChange = useDraftChangeHandler({
    committedVersionId: args.committedVersionId,
    getPendingDraftCommit,
    clearPendingDraftCommit: pending.clearPendingDraftCommit,
    clearPendingUserInputEvidence: userInputEvidence.clearPendingUserInputEvidence,
    hasPendingUserInputEvidence: userInputEvidence.hasPendingUserInputEvidence,
    latestCommittedContentRef,
    nodeId,
    onCommit,
    scheduleFlush,
    setDraftState,
    setPendingDraftCommit: pending.setPendingDraftCommit,
    setPendingTitleRefresh: pending.setPendingTitleRefresh,
    timerRef
  });
  const handleEditorInput = useEditorDraftInputWithEvidence({
    getPendingDraftCommit,
    nodeId,
    scheduleFlush,
    userInputEvidence
  });

  const editorContent = useEditorContent(nodeId, draftState, committedContent);
  useCommittedContentSync({
    clearPendingDraftCommit: pending.clearPendingDraftCommit,
    committedContent,
    draftState,
    flushPendingDraftForDifferentNode: pending.flushPendingDraftForDifferentNode,
    getPendingDraftCommit,
    nodeId,
    onFinalizeNode,
    setDraftState
  });

  return createEditorDraftSyncApi({ editorContent, flushDraft, handleEditorChange, handleEditorInput });
}

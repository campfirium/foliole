import { startTransition, useCallback, type MutableRefObject } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { deferNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

import { applyEditorDraftHistoryReplay, type EditorDraftHistoryReplayArgs } from './editorDraftHistoryReplay';
import { clearDraftTimer, type PendingDraftCommit } from './useEditorDraftPendingCommit';

interface DraftChangeHandlerArgs extends Omit<EditorDraftHistoryReplayArgs, 'content'> {
  committedVersionId?: string | null | undefined;
  getPendingDraftCommit: () => PendingDraftCommit | null;
  hasPendingUserInputEvidence: (nodeId: string | null, content: string) => boolean;
  latestCommittedContentRef: MutableRefObject<string>;
  scheduleFlush: () => void;
  setPendingDraftCommit: (pendingCommit: PendingDraftCommit) => void;
}

export function useDraftChangeHandler(args: DraftChangeHandlerArgs) {
  return useCallback((content: string, meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? args.nodeId;
    if (meta?.origin === 'history') {
      applyEditorDraftHistoryReplay({ ...args, content, nodeId: sourceNodeId });
      return;
    }
    if (!sourceNodeId) {
      if (content === '') {
        return;
      }
      args.onCommit(null, content);
      return;
    }
    if (content === '' && sourceNodeId !== args.nodeId) {
      return;
    }
    if (!args.hasPendingUserInputEvidence(sourceNodeId, content)) {
      return;
    }
    const committedContent = sourceNodeId === args.nodeId ? args.latestCommittedContentRef.current : null;
    if (sourceNodeId === args.nodeId) {
      startTransition(() => {
        args.setDraftState({ content, nodeId: sourceNodeId });
      });
    }
    args.clearPendingUserInputEvidence(sourceNodeId);
    deferNodeContentRuntimePersist(sourceNodeId);
    args.setPendingTitleRefresh({ content, nodeId: sourceNodeId });
    if (committedContent !== null && content === committedContent) {
      clearDraftTimer(args.timerRef);
      args.clearPendingDraftCommit();
      return;
    }
    args.setPendingDraftCommit(buildPendingDraftCommit(args, sourceNodeId, content, committedContent, meta));
    args.scheduleFlush();
  }, [
    args.clearPendingDraftCommit,
    args.committedVersionId,
    args.getPendingDraftCommit,
    args.clearPendingUserInputEvidence,
    args.hasPendingUserInputEvidence,
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

function buildPendingDraftCommit(args: DraftChangeHandlerArgs, sourceNodeId: string, content: string,
  committedContent: string | null, meta?: EditorContentChangeMeta): PendingDraftCommit {
  const previous = args.getPendingDraftCommit();
  return {
    baseVersionId: previous?.nodeId === sourceNodeId ? previous.baseVersionId
      : sourceNodeId === args.nodeId ? args.committedVersionId : undefined,
    newImageReferences: meta?.newImageReferences ?? (previous?.nodeId === sourceNodeId ? previous.newImageReferences : undefined),
    committedContent,
    content,
    nodeId: sourceNodeId,
    onCommit: args.onCommit
  };
}

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
    const previous = args.getPendingDraftCommit();
    args.setPendingDraftCommit({
      baseVersionId: previous?.nodeId === sourceNodeId ? previous.baseVersionId : args.committedVersionId,
      committedContent,
      content,
      nodeId: sourceNodeId,
      onCommit: args.onCommit
    });
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

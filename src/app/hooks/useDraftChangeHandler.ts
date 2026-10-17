import { startTransition, useCallback, type MutableRefObject } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { deferNodeContentRuntimePersist, resumeNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

import { applyEditorDraftHistoryReplay, type EditorDraftHistoryReplayArgs } from './editorDraftHistoryReplay';
import { clearDraftTimer, type PendingDraftCommit } from './useEditorDraftPendingCommit';
import type { EditorInputBase } from './useEditorDraftUserInputEvidence';

interface DraftChangeHandlerArgs extends Omit<EditorDraftHistoryReplayArgs, 'content'> {
  readInputBase: (nodeId: string | null) => EditorInputBase | null;
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
    const inputBase = args.readInputBase(sourceNodeId);
    args.clearPendingUserInputEvidence(sourceNodeId);
    deferNodeContentRuntimePersist(sourceNodeId);
    args.setPendingTitleRefresh({ content, nodeId: sourceNodeId });
    if (committedContent !== null && content === committedContent) {
      clearDraftTimer(args.timerRef);
      args.clearPendingDraftCommit();
      resumeNodeContentRuntimePersist(sourceNodeId);
      return;
    }
    args.setPendingDraftCommit(buildPendingDraftCommit(args, sourceNodeId, content, committedContent, meta, inputBase));
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
    args.readInputBase,
    args.scheduleFlush,
    args.setDraftState,
    args.setPendingDraftCommit,
    args.setPendingTitleRefresh,
    args.timerRef
  ]);
}

function buildPendingDraftCommit(args: DraftChangeHandlerArgs, sourceNodeId: string, content: string,
  committedContent: string | null, meta: EditorContentChangeMeta | undefined, inputBase: EditorInputBase | null): PendingDraftCommit {
  const previous = args.getPendingDraftCommit();
  return {
    baseVersionId: previous?.nodeId === sourceNodeId ? previous.baseVersionId
      : inputBase ? inputBase.versionId : sourceNodeId === args.nodeId ? args.committedVersionId : undefined,
    newImageReferences: meta?.newImageReferences ?? (previous?.nodeId === sourceNodeId ? previous.newImageReferences : undefined),
    committedContent: previous?.nodeId === sourceNodeId ? previous.committedContent : inputBase?.content ?? committedContent,
    content,
    nodeId: sourceNodeId,
    onCommit: args.onCommit
  };
}

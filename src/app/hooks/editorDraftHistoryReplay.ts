import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { deferNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

import type { EditorDraftCommit } from './useEditorDraftFlushCallbacks';
import { clearDraftTimer, type PendingTitleRefresh } from './useEditorDraftPendingCommit';

export interface EditorDraftHistoryReplayArgs {
  clearPendingDraftCommit: () => void;
  clearPendingUserInputEvidence: (nodeId: string | null) => void;
  content: string;
  nodeId: string | null;
  onCommit: EditorDraftCommit;
  setDraftState: Dispatch<SetStateAction<{ content: string; nodeId: string | null }>>;
  setPendingTitleRefresh: (pendingTitle: PendingTitleRefresh | null) => void;
  timerRef: MutableRefObject<number | null>;
}

export function applyEditorDraftHistoryReplay(args: EditorDraftHistoryReplayArgs) {
  if (!args.nodeId) return;
  clearDraftTimer(args.timerRef);
  args.clearPendingDraftCommit();
  args.clearPendingUserInputEvidence(args.nodeId);
  args.setPendingTitleRefresh(null);
  args.setDraftState({ content: args.content, nodeId: args.nodeId });
  deferNodeContentRuntimePersist(args.nodeId);
  args.onCommit(args.nodeId, args.content, { historyReplay: true, publishLocal: true });
}

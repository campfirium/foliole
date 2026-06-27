import { useEditorDraftInputHandler } from './useEditorDraftInputHandler';
import type { PendingDraftCommit } from './useEditorDraftPendingCommit';
import { useEditorDraftUserInputEvidence } from './useEditorDraftUserInputEvidence';

export function useEditorDraftInputWithEvidence(args: {
  getPendingDraftCommit: () => PendingDraftCommit | null;
  nodeId: string | null;
  scheduleFlush: () => void;
  userInputEvidence: ReturnType<typeof useEditorDraftUserInputEvidence>;
}) {
  return useEditorDraftInputHandler(args.nodeId, (sourceNodeId, contentLength) => {
    args.userInputEvidence.markPendingUserInputEvidence(sourceNodeId, contentLength);
    if (args.getPendingDraftCommit()) {
      args.scheduleFlush();
    }
  });
}

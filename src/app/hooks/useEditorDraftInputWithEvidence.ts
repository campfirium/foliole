import type { MutableRefObject } from 'react';

import { useEditorDraftInputHandler } from './useEditorDraftInputHandler';
import { clearDraftTimer } from './useEditorDraftPendingCommit';
import { useEditorDraftUserInputEvidence } from './useEditorDraftUserInputEvidence';

export function useEditorDraftInputWithEvidence(args: {
  nodeId: string | null;
  timerRef: MutableRefObject<number | null>;
  userInputEvidence: ReturnType<typeof useEditorDraftUserInputEvidence>;
}) {
  return useEditorDraftInputHandler(args.nodeId, (sourceNodeId, contentLength) => {
    args.userInputEvidence.markPendingUserInputEvidence(sourceNodeId, contentLength);
    clearDraftTimer(args.timerRef);
  });
}

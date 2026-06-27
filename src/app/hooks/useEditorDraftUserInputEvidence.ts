import { useCallback, useRef } from 'react';

import type { PendingDraftCommit } from './useEditorDraftPendingCommit';

export function useEditorDraftUserInputEvidence(getPendingDraftCommit: () => PendingDraftCommit | null) {
  const pendingUserInputRef = useRef<{ contentLength: number | null; nodeId: string | null } | null>(null);
  const clearPendingUserInputEvidence = useCallback((sourceNodeId: string | null) => {
    if (!sourceNodeId || pendingUserInputRef.current?.nodeId === sourceNodeId) {
      pendingUserInputRef.current = null;
    }
  }, []);
  const hasFreshDraftEvidence = useCallback((sourceNodeId: string | null, content: string) => {
    if (!sourceNodeId) {
      return false;
    }
    const pendingCommit = getPendingDraftCommit();
    const pendingInput = pendingUserInputRef.current;
    if (pendingCommit?.nodeId === sourceNodeId) {
      return true;
    }
    return pendingInput?.nodeId === sourceNodeId
      && (pendingInput.contentLength === null || pendingInput.contentLength === content.length);
  }, [getPendingDraftCommit]);
  const hasPendingUserInputEvidence = useCallback((sourceNodeId: string | null, content: string) => {
    const pendingInput = pendingUserInputRef.current;
    return Boolean(pendingInput?.nodeId === sourceNodeId
      && (pendingInput.contentLength === null || pendingInput.contentLength === content.length));
  }, []);
  const markPendingUserInputEvidence = useCallback((sourceNodeId: string | null, contentLength: number | null) => {
    pendingUserInputRef.current = { contentLength, nodeId: sourceNodeId };
  }, []);

  return {
    clearPendingUserInputEvidence,
    hasFreshDraftEvidence,
    hasPendingUserInputEvidence,
    markPendingUserInputEvidence
  };
}

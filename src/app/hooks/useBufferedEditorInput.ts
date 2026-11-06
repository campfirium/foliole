import { useCallback, useRef } from 'react';

import type { EditorInputBase } from './useEditorDraftUserInputEvidence';

export function useBufferedEditorInput() {
  const pendingUserInputRef = useRef<{
    contentLength: number | null;
    nodeId: string | null;
    base: EditorInputBase | null;
  } | null>(null);
  const inputWaiters = useRef(new Set<{ nodeId: string; resolve: () => void }>());
  const clearPendingUserInputEvidence = useCallback((sourceNodeId: string | null) => {
    if (!sourceNodeId || pendingUserInputRef.current?.nodeId === sourceNodeId) pendingUserInputRef.current = null;
    for (const waiter of inputWaiters.current) {
      if (!sourceNodeId || waiter.nodeId === sourceNodeId) {
        inputWaiters.current.delete(waiter);
        waiter.resolve();
      }
    }
  }, []);
  const hasBufferedInput = useCallback((nodeId: string | null) =>
    Boolean(nodeId && pendingUserInputRef.current?.nodeId === nodeId), []);
  const waitForBufferedInput = useCallback((nodeId: string) => {
    if (!hasBufferedInput(nodeId)) return Promise.resolve();
    return new Promise<void>(resolve => { inputWaiters.current.add({ nodeId, resolve }); });
  }, [hasBufferedInput]);
  return { pendingUserInputRef, clearPendingUserInputEvidence, hasBufferedInput, waitForBufferedInput };
}

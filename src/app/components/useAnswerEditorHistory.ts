import { useCallback, useEffect, useRef } from 'react';

import type { EditorAdapter, EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { EditorOperationApplyContext } from '../../store/workspaceStoreTypes';
import { registerUndoRouterContentContext } from '../hooks/undoRouter';

export function useAnswerEditorHistory(answerDocumentId: string | null) {
  const adapterRef = useRef<EditorAdapter | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  const handleReady = useCallback((adapter: EditorAdapter | null) => {
    unregisterRef.current?.();
    unregisterRef.current = null;
    adapterRef.current = adapter;
    if (!adapter || !answerDocumentId) return;
    const context: EditorOperationApplyContext = {
      applyText: (entry, mode) => adapterRef.current?.applyTextHistory?.(entry, mode) ?? false,
      currentContent: adapter.getContent(),
      getCurrentContent: () => adapterRef.current?.getContent() ?? '',
      nodeId: answerDocumentId
    };
    unregisterRef.current = registerUndoRouterContentContext(answerDocumentId, context);
  }, [answerDocumentId]);

  const handleDocumentInput = useCallback((meta?: EditorContentChangeMeta) => {
    for (const transaction of meta?.textTransactions ?? []) {
      if (transaction.nodeId === answerDocumentId) {
        useWorkspaceStore.getState().pushEditorOperationEntry(transaction);
      }
    }
  }, [answerDocumentId]);

  useEffect(() => () => unregisterRef.current?.(), []);

  return { handleDocumentInput, handleReady };
}

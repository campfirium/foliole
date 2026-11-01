import { useCallback, useEffect, useRef } from 'react';

import type { EditorAdapter, EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { getEditorTextHistorySource } from '../../features/editor/model/editorNativeOperationHistory';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { EditorOperationApplyContext } from '../../store/workspaceStoreTypes';
import { applyEditorTextReplay } from '../hooks/editorTextReplaySave';
import { registerUndoRouterContentContext } from '../hooks/undoRouter';

export function useAnswerEditorHistory(answerDocumentId: string | null, targetNodeId?: string | null) {
  const adapterRef = useRef<EditorAdapter | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  const handleReady = useCallback((adapter: EditorAdapter | null) => {
    unregisterRef.current?.();
    unregisterRef.current = null;
    adapterRef.current = adapter;
    if (!adapter || !answerDocumentId) return;
    adapter.bindTextHistorySource?.(nodeId => getEditorTextHistorySource(useWorkspaceStore.getState().editorOperationHistory, nodeId,
      targetNodeId ? { nodeId: targetNodeId, field: 'reveal' } : undefined));
    const context: EditorOperationApplyContext = {
      applyText: (entry, mode) => applyEditorTextReplay(adapterRef.current, entry, mode),
      currentContent: adapter.getContent(),
      getCurrentContent: () => adapterRef.current?.getContent() ?? '',
      nodeId: answerDocumentId
    };
    unregisterRef.current = registerUndoRouterContentContext(answerDocumentId, context);
  }, [answerDocumentId, targetNodeId]);

  const handleDocumentInput = useCallback((meta?: EditorContentChangeMeta) => {
    for (const transaction of meta?.textTransactions ?? []) {
      if (transaction.nodeId === answerDocumentId) {
        const state = useWorkspaceStore.getState();
        const version = targetNodeId ? state.nodesById?.[targetNodeId]?.currentVersionId ?? '' : '';
        state.pushEditorOperationEntry(targetNodeId ? { ...transaction, target: {
          nodeId: targetNodeId, field: 'reveal', beforeVersionId: version, afterVersionId: version
        } } : transaction);
      }
    }
  }, [answerDocumentId, targetNodeId]);

  useEffect(() => () => unregisterRef.current?.(), []);

  return { handleDocumentInput, handleReady };
}

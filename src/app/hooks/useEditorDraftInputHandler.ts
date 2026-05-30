import { useCallback } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { deferNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

export function useEditorDraftInputHandler(nodeId: string | null, onInput?: () => void) {
  return useCallback((meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? nodeId;
    if (sourceNodeId) {
      deferNodeContentRuntimePersist(sourceNodeId);
    }
    onInput?.();
  }, [nodeId, onInput]);
}

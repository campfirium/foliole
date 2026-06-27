import { useCallback } from 'react';

import type { EditorContentChangeMeta } from '../../features/editor/adapters/EditorAdapter';
import { deferNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

export function useEditorDraftInputHandler(
  nodeId: string | null,
  onInput?: (nodeId: string | null, contentLength: number | null) => void
) {
  return useCallback((meta?: EditorContentChangeMeta) => {
    const sourceNodeId = meta?.nodeId ?? nodeId;
    if (sourceNodeId) {
      deferNodeContentRuntimePersist(sourceNodeId);
    }
    onInput?.(sourceNodeId, meta?.contentLength ?? null);
  }, [nodeId, onInput]);
}

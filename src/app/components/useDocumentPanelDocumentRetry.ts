import { useCallback, useState } from 'react';

import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';

export function useDocumentPanelDocumentRetry(editorNodeId: string | null) {
  const [retryingNodeId, setRetryingNodeId] = useState<string | null>(null);
  const retryDocumentLoad = useCallback(() => {
    if (!editorNodeId) {
      return;
    }
    setRetryingNodeId(editorNodeId);
    void ensureWorkspaceNodeDocumentReady(editorNodeId, { forceLoad: true }).catch((error) => {
      logRuntimeWarning('document panel body retry failed', {
        area: 'persistence',
        action: 'retry_node_document_load',
        fallback: 'keep_error_state',
        nodeId: editorNodeId,
        error
      });
    }).finally(() => {
      setRetryingNodeId((currentNodeId) => currentNodeId === editorNodeId ? null : currentNodeId);
    });
  }, [editorNodeId]);

  return {
    isRetryingDocument: Boolean(editorNodeId && retryingNodeId === editorNodeId),
    retryDocumentLoad
  };
}

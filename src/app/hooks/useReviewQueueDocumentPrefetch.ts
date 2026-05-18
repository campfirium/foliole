import { useEffect } from 'react';

import { requestWorkspaceNodeDocumentPreload } from '../../store/workspaceNodeDocumentPrefetch';

export function useReviewQueueDocumentPrefetch(args: {
  currentNodeId: string | null;
  queueNodeIds: string[];
}) {
  const queueSignature = args.queueNodeIds.join('\0');

  useEffect(() => {
    if (!args.currentNodeId || args.queueNodeIds.length <= 1) {
      return;
    }
    requestWorkspaceNodeDocumentPreload();
  }, [args.currentNodeId, args.queueNodeIds.length, queueSignature]);
}

import { useEffect } from 'react';

import { resolveNextDocumentId } from '../../shared/lib/documents/documentPreparation';
import { requestWorkspaceNodeDocumentPreload } from '../../store/workspaceNodeDocumentPrefetch';

export { resolveNextDocumentId as resolveNextReviewPrefetchNodeId } from '../../shared/lib/documents/documentPreparation';

export function useReviewQueueDocumentPrefetch(args: {
  currentNodeId: string | null;
  queueNodeIds: string[];
}) {
  const queueSignature = args.queueNodeIds.join('\0');

  useEffect(() => {
    const nextNodeId = resolveNextDocumentId(args.currentNodeId, args.queueNodeIds);
    if (!nextNodeId) {
      return;
    }
    requestWorkspaceNodeDocumentPreload([nextNodeId]);
  }, [args.currentNodeId, args.queueNodeIds.length, queueSignature]);
}

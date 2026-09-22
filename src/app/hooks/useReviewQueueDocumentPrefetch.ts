import { useEffect } from 'react';

import { requestWorkspaceNodeDocumentPreload } from '../../store/workspaceNodeDocumentPrefetch';

export function resolveNextReviewPrefetchNodeId(currentNodeId: string | null, queueNodeIds: string[]) {
  if (!currentNodeId) {
    return null;
  }
  const currentIndex = queueNodeIds.indexOf(currentNodeId);
  return currentIndex >= 0
    ? (queueNodeIds[currentIndex + 1] ?? null)
    : (queueNodeIds.find((nodeId) => nodeId !== currentNodeId) ?? null);
}

export function useReviewQueueDocumentPrefetch(args: {
  currentNodeId: string | null;
  queueNodeIds: string[];
}) {
  const queueSignature = args.queueNodeIds.join('\0');

  useEffect(() => {
    const nextNodeId = resolveNextReviewPrefetchNodeId(args.currentNodeId, args.queueNodeIds);
    if (!nextNodeId) {
      return;
    }
    requestWorkspaceNodeDocumentPreload([nextNodeId]);
  }, [args.currentNodeId, args.queueNodeIds.length, queueSignature]);
}

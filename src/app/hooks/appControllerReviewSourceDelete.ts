import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { requestFoliolePublishedDelete } from '../../shared/platform/foliolePublishedManagement';

interface ReviewSourceTopicDeleteWorkspace {
  deleteNode: (nodeId: string) => void;
  nodesById: Record<string, Node | undefined>;
  trashedNodeIds: string[];
}

export interface ReviewSourceTopicDeleteDialogState {
  isOpen: boolean;
  nodeTitle: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  requestDeleteSourceTopic: (nodeId: string) => boolean;
}

export function useReviewSourceTopicDeleteDialog(ws: ReviewSourceTopicDeleteWorkspace): ReviewSourceTopicDeleteDialogState {
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const targetNode = targetNodeId ? ws.nodesById[targetNodeId] : undefined;
  const isTargetCurrent = Boolean(targetNodeId && targetNode && !targetNode.specialKind && !ws.trashedNodeIds.includes(targetNodeId));

  useEffect(() => {
    if (targetNodeId && !isTargetCurrent) {
      setTargetNodeId(null);
    }
  }, [isTargetCurrent, targetNodeId]);

  const onCancel = useCallback(() => setTargetNodeId(null), []);
  const onConfirm = useCallback(() => {
    if (targetNodeId && isTargetCurrent) {
      ws.deleteNode(targetNodeId);
    }
    setTargetNodeId(null);
  }, [isTargetCurrent, targetNodeId, ws]);
  const requestDeleteSourceTopic = useCallback((nodeId: string) => {
    requestFoliolePublishedDelete({
      nodeIds: [nodeId],
      onAllowed: () => setTargetNodeId((current) => current ?? nodeId)
    });
    return true;
  }, []);

  return useMemo(() => ({
    isOpen: Boolean(targetNodeId && isTargetCurrent),
    nodeTitle: targetNode?.title ?? null,
    onCancel,
    onConfirm,
    requestDeleteSourceTopic
  }), [isTargetCurrent, onCancel, onConfirm, requestDeleteSourceTopic, targetNode?.title, targetNodeId]);
}

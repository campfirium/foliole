import { useWorkspaceStore } from '../../store/workspaceStore';

import type { WorkspaceDebugApi } from './workspaceDebugBridgeTypes';

export function getDebugNode(nodeId: string): ReturnType<WorkspaceDebugApi['getNode']> {
  const state = useWorkspaceStore.getState();
  const node = state.nodesById[nodeId];
  if (!node) return null;
  return {
    anchorKind: node.anchorLink?.kind ?? null,
    anchorLink: node.anchorLink ?? null,
    content: node.content,
    id: node.id,
    kind: node.kind,
    parentNodeId: node.parentNodeId,
    reading: node.reading ? { ...node.reading } : null,
    reveal: node.reveal,
    review: node.review ? { ...node.review } : null,
    shelvedAt: node.shelvedAt ?? null,
    title: node.title,
    trashed: state.trashedNodeIds.includes(nodeId)
  };
}

export function getDebugReviewSession(): ReturnType<WorkspaceDebugApi['getReviewSession']> {
  const reviewSession = useWorkspaceStore.getState().reviewSession;
  return {
    ...reviewSession,
    queueNodeIds: [...reviewSession.queueNodeIds],
    ...(reviewSession.soonNodeIds ? { soonNodeIds: [...reviewSession.soonNodeIds] } : {})
  };
}

import { useWorkspaceStore, type WorkspaceState } from '../../store/workspaceStore';

export const readReviewTopicAfterFlush: WorkspaceState['readReviewTopic'] = async (now, options) => {
  const before = useWorkspaceStore.getState();
  const nodeId = before.reviewSession.currentNodeId;
  if (!nodeId || before.activeNodeId !== nodeId) return false;
  await window.__folioleFlushReadingProgressBeforeClose?.();
  const current = useWorkspaceStore.getState();
  if (current.activeNodeId !== nodeId || current.reviewSession.currentNodeId !== nodeId ||
      current.libraryScope !== before.libraryScope) return false;
  return current.readReviewTopic(now, options);
};

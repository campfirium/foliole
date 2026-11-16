import { isSameWorkspaceReviewSession } from '../../store/workspaceHistoryContext';
import { useWorkspaceStore, type WorkspaceState } from '../../store/workspaceStore';

export const gradeReviewCardAfterFlush: WorkspaceState['gradeReviewCard'] = async (grade, now) => {
  const before = useWorkspaceStore.getState();
  const nodeId = before.reviewSession.currentNodeId;
  if (!nodeId || before.activeNodeId !== nodeId || !before.reviewSession.isAnswerRevealed) return false;
  const flush = window.__folioleFlushPendingEditorDraftBeforeClose;
  if (!flush) return false;
  try {
    if (!await flush()) return false;
  } catch {
    return false;
  }
  const current = useWorkspaceStore.getState();
  if (current.activeNodeId !== nodeId || current.libraryScope !== before.libraryScope ||
      !isSameWorkspaceReviewSession(current.reviewSession, before.reviewSession)) return false;
  return current.gradeReviewCard(grade, now);
};

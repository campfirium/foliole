import type { ReviewGrade } from '../../features/review/model/reviewTypes';
import { isSameWorkspaceReviewSession } from '../../store/workspaceHistoryContext';
import type { WorkspaceReviewGradeObserver } from '../../store/workspaceReviewGradeObserver';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { beginFlowGradeTrace } from './desktopFlowGradeTrace';

async function submit(grade: ReviewGrade, now?: string, observer?: WorkspaceReviewGradeObserver) {
  const before = useWorkspaceStore.getState();
  const nodeId = before.reviewSession.currentNodeId;
  observer?.stage('editor-context');
  if (!nodeId || before.activeNodeId !== nodeId || !before.reviewSession.isAnswerRevealed) return false;
  const flush = window.__folioleFlushPendingEditorDraftBeforeClose;
  observer?.stage('editor-flush-unavailable');
  if (!flush) return false;
  try {
    observer?.stage('editor-flush-rejected');
    if (!await flush()) return false;
  } catch {
    observer?.stage('editor-flush-error');
    return false;
  }
  const current = useWorkspaceStore.getState();
  observer?.stage('editor-context-changed');
  if (current.activeNodeId !== nodeId || current.libraryScope !== before.libraryScope ||
      !isSameWorkspaceReviewSession(current.reviewSession, before.reviewSession)) return false;
  return observer ? current.gradeReviewCard(grade, now, observer) : current.gradeReviewCard(grade, now);
}

export async function gradeReviewCardAfterFlush(grade: ReviewGrade, now?: string) {
  const trace = beginFlowGradeTrace(grade, useWorkspaceStore.getState().reviewSession.currentNodeId);
  if (!trace) return submit(grade, now);
  let accepted = false;
  try {
    accepted = await submit(grade, now, trace.observer);
    return accepted;
  } finally {
    trace.finish(accepted);
  }
}

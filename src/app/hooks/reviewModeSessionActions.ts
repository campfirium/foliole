export interface StartStudyModeOptions {
  force?: boolean;
}

export interface ReviewModeSessionActions {
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  startReviewSession: () => boolean;
  startStudyMode: (options?: StartStudyModeOptions) => void;
}

export function enterReviewModeSession(actions: Pick<ReviewModeSessionActions, 'startReviewSession' | 'startStudyMode'>) {
  if (!actions.startReviewSession()) {
    return false;
  }
  actions.startStudyMode({ force: true });
  return true;
}

export function toggleReviewModeSession(isReviewMode: boolean, actions: ReviewModeSessionActions) {
  if (isReviewMode) {
    actions.exitReviewSession();
    actions.exitStudyMode();
    return true;
  }
  return enterReviewModeSession(actions);
}

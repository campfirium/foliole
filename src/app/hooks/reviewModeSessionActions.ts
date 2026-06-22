export interface StartStudyModeOptions {
  force?: boolean;
}

export interface ReviewModeSessionActions {
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  onReviewQueueEmpty?: () => void;
  onReviewSessionStarted?: () => void;
  startReviewSession: () => boolean;
  startStudyMode: (options?: StartStudyModeOptions) => void;
}

export function enterReviewModeSession(actions: Pick<ReviewModeSessionActions, 'onReviewQueueEmpty' | 'onReviewSessionStarted' | 'startReviewSession' | 'startStudyMode'>) {
  if (!actions.startReviewSession()) {
    actions.onReviewQueueEmpty?.();
    return false;
  }
  actions.onReviewSessionStarted?.();
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

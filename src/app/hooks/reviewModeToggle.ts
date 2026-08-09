interface ReviewModeToggleActions {
  enterReviewMode: () => void;
  exitReviewMode: () => void;
}

export function runReviewModeToggle(isReviewMode: boolean, actions: ReviewModeToggleActions) {
  if (isReviewMode) {
    actions.exitReviewMode();
    return;
  }
  actions.enterReviewMode();
}

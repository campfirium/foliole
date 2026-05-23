type ReviewStatus = 'idle' | 'awaiting-answer' | 'answer-revealed' | 'completed';

function getReviewStatusLabel(status: ReviewStatus) {
  if (status === 'idle') {
    return 'Flow mode';
  }
  if (status === 'awaiting-answer') {
    return 'Awaiting answer';
  }
  if (status === 'answer-revealed') {
    return 'Answer revealed';
  }
  return 'Queue clear';
}

export function WorkspaceListStudyStatusBar({
  isStudyMode,
  reviewCompletedCount,
  reviewDueCount,
  reviewQueueCount,
  reviewStatus
}: {
  isStudyMode: boolean;
  reviewCompletedCount: number;
  reviewDueCount: number;
  reviewQueueCount: number;
  reviewStatus: ReviewStatus;
}) {
  if (!isStudyMode) {
    return null;
  }

  return (
    <div className="flex h-[var(--workspace-bottom-toolbar-height)] flex-none items-center border-t border-border bg-bg-panel px-4">
      <p className="truncate text-xs font-medium text-foreground/70">
        Flow · {Math.max(reviewQueueCount, 0)} left · {Math.max(reviewCompletedCount, 0)} done · {getReviewStatusLabel(reviewStatus)}
        {' · '}
        {Math.max(reviewDueCount, 0)} due now
      </p>
    </div>
  );
}

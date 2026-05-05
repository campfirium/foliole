import type { WorkspaceLayoutProps } from './WorkspaceLayout';

function getReviewStatusLabel(status: WorkspaceLayoutProps['reviewStatus']) {
  if (status === 'awaiting-answer') {
    return 'Awaiting answer';
  }
  if (status === 'answer-revealed') {
    return 'Answer revealed';
  }
  return 'Session complete';
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
  reviewStatus: WorkspaceLayoutProps['reviewStatus'];
}) {
  if (!isStudyMode) {
    return null;
  }

  return (
    <div className="flex h-[56px] flex-none items-center border-t border-border bg-bg-panel px-3">
      <p className="truncate text-xs font-medium text-foreground/70">
        Reviewing · {Math.max(reviewQueueCount, 0)} left · {Math.max(reviewCompletedCount, 0)} done · {getReviewStatusLabel(reviewStatus)}
        {' · '}
        {Math.max(reviewDueCount, 0)} due now
      </p>
    </div>
  );
}

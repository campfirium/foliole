import { AppEmptyState, AppErrorState } from '../shared/ui';

type ReviewFallbackSession = {
  nextFsrsDueAt: string | null;
  nextReadingDueAt: string | null;
  scheduledFsrsCount: number;
  scheduledReadingCount: number;
};

function formatDueLabel(timestamp: string | null) {
  return timestamp ? new Date(timestamp).toLocaleString() : null;
}

export function CompanionReviewFallback(props: {
  error: string | null;
  hasSnapshot: boolean;
  reviewSession: ReviewFallbackSession;
}) {
  const nextFsrsLabel = formatDueLabel(props.reviewSession.nextFsrsDueAt);
  const nextReadingLabel = formatDueLabel(props.reviewSession.nextReadingDueAt);
  const hasScheduledReviews = props.reviewSession.scheduledFsrsCount > 0 || props.reviewSession.scheduledReadingCount > 0;

  return (
    <section className="border-t border-companion-divider px-1 py-6 text-sm leading-6 text-companion-text-secondary">
      {props.hasSnapshot ? (
        <>
          <AppEmptyState
            className="min-h-0 items-start text-left text-companion-text-secondary"
            description={hasScheduledReviews
              ? 'Your synced review state has no due work right now.'
              : 'Pull a newer snapshot when you want this device to refresh upcoming review work.'}
            title={hasScheduledReviews ? 'No items are due right now' : 'No items scheduled on this device'}
          />
          {nextReadingLabel ? <p className="mt-3">Next reading topic: {nextReadingLabel}</p> : null}
          {nextFsrsLabel ? <p className="mt-2">Next item: {nextFsrsLabel}</p> : null}
          <p className="mt-3">
            {hasScheduledReviews
              ? `Synced review state: ${props.reviewSession.scheduledReadingCount} reading topics, ${props.reviewSession.scheduledFsrsCount} items.`
              : 'Connect to desktop to bring review work onto this device.'}
          </p>
        </>
      ) : (
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description="Connect this device with desktop and keep both devices on the same network."
          title="No topics synced yet"
        />
      )}
      {props.error ? (
        <AppErrorState
          className="mt-4 min-h-0 items-start text-left text-error"
          description={props.error}
          title="Review queue could not refresh"
        />
      ) : null}
    </section>
  );
}

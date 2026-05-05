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
          <p>{hasScheduledReviews ? 'No review items are due right now.' : 'No review items have been scheduled on this device yet.'}</p>
          {nextReadingLabel ? <p className="mt-3">Next reading topic: {nextReadingLabel}</p> : null}
          {nextFsrsLabel ? <p className="mt-2">Next review item: {nextFsrsLabel}</p> : null}
          <p className="mt-3">
            {hasScheduledReviews
              ? `Synced review state: ${props.reviewSession.scheduledReadingCount} reading topics, ${props.reviewSession.scheduledFsrsCount} review items.`
              : 'Pull a newer snapshot when you want this device to refresh upcoming review work.'}
          </p>
        </>
      ) : (
        <>
          <p>No topics have been synced to this device yet.</p>
          <p className="mt-3">
            Connect this device with desktop and keep both devices on the same network.
          </p>
        </>
      )}
      {props.error ? <span className="mt-4 block text-error">{props.error}</span> : null}
    </section>
  );
}

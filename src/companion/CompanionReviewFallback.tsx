import { GraduationCap } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState, AppErrorState } from '../shared/ui';

import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';

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
  const t = useTranslation();
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
              ? t('companion.review.noDueDescription')
              : t('companion.review.noScheduledDescription')}
            icon={<CompanionEmptyStateIcon Icon={GraduationCap} />}
            title={hasScheduledReviews ? t('companion.review.noDueTitle') : t('companion.review.noScheduledTitle')}
          />
          {nextReadingLabel ? <p className="mt-3">{t('companion.review.nextReading', { date: nextReadingLabel })}</p> : null}
          {nextFsrsLabel ? <p className="mt-2">{t('companion.review.nextItem', { date: nextFsrsLabel })}</p> : null}
          <p className="mt-3">
            {hasScheduledReviews
              ? t('companion.review.syncedState', {
                itemCount: props.reviewSession.scheduledFsrsCount,
                readingCount: props.reviewSession.scheduledReadingCount
              })
              : t('companion.review.connectForWork')}
          </p>
        </>
      ) : (
        <AppEmptyState
          className="min-h-0 items-start text-left text-companion-text-secondary"
          description={t('companion.review.noTopicsDescription')}
          icon={<CompanionEmptyStateIcon Icon={GraduationCap} />}
          title={t('companion.review.noTopicsTitle')}
        />
      )}
      {props.error ? (
        <AppErrorState
          className="mt-4 min-h-0 items-start text-left text-error"
          description={props.error}
          title={t('companion.review.refreshError')}
        />
      ) : null}
    </section>
  );
}

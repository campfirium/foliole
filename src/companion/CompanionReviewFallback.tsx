import { StudySessionCompleteSummary } from '../features/review/components/StudySessionCompleteSummary';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppErrorState } from '../shared/ui';

import type { useCompanionFlowSession } from './useCompanionFlowSession';

export function CompanionReviewFallback(props: {
  summary: ReturnType<typeof useCompanionFlowSession>['summary'];
  error: string | null;
  hasSnapshot: boolean;
  hasTopics: boolean;
  canContinueReading: boolean;
  onContinueReading(): void;
}) {
  const t = useTranslation();
  if (props.error) return <AppErrorState description={props.error} title={t('companion.review.refreshError')} />;
  const queueClear = props.hasSnapshot && props.hasTopics && (props.summary.queueCleared ?? true);
  if (queueClear) return (
    <StudySessionCompleteSummary {...props.summary} layout="companion" createdItemCount={0} createdTopicCount={0}
      reviewSessionMode="recommended" action={props.canContinueReading ? (
        <AppButton onClick={props.onContinueReading} size="md" variant="subtle">
          {t('desktop.reviewActions.continueReading')}
        </AppButton>
      ) : null} />
  );
  return (
    <section className="companion-page-start px-1 pb-6 text-sm leading-6 text-companion-text-secondary">
      <AppEmptyState
        className="min-h-0 text-companion-text-secondary"
        description={t('companion.review.noTopicsDescription')}
        title={t('companion.review.noTopicsTitle')}
      />
    </section>
  );
}

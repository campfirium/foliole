import { StudySessionCompleteSummary } from '../features/review/components/StudySessionCompleteSummary';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppErrorState } from '../shared/ui';

import { CompanionReviewActionFooter } from './CompanionReviewActionFooter';
import type { useCompanionFlowSession } from './useCompanionFlowSession';

export function CompanionReviewFallback(props: {
  summary: ReturnType<typeof useCompanionFlowSession>['summary'];
  mode?: ReviewSessionMode;
  error: string | null;
  hasSnapshot: boolean;
  hasTopics: boolean;
  onExit(): void;
}) {
  const t = useTranslation();
  if (props.error) return <AppErrorState description={props.error} title={t('companion.review.refreshError')} />;
  const queueClear = props.hasSnapshot && props.hasTopics && (props.summary.queueCleared ?? true);
  if (queueClear) return (
    <>
      <StudySessionCompleteSummary {...props.summary} layout="companion" createdItemCount={0} createdTopicCount={0}
        reviewSessionMode={props.mode ?? 'recommended'} />
      <CompanionReviewActionFooter primary={(
        <AppButton className="min-w-32 px-5" onClick={props.onExit} size="md" variant="default">
          {t('companion.review.exitFlow')}
        </AppButton>
      )} />
    </>
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

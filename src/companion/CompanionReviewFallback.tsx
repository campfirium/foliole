import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton, AppEmptyState, AppErrorState } from '../shared/ui';

export function CompanionReviewFallback(props: {
  error: string | null;
  hasSnapshot: boolean;
  hasTopics: boolean;
  canContinueReading: boolean;
  onContinueReading(): void;
}) {
  const t = useTranslation();
  if (props.error) return <AppErrorState description={props.error} title={t('companion.review.refreshError')} />;
  const queueClear = props.hasSnapshot && props.hasTopics;
  if (queueClear) return (
    <section className="companion-flow-complete" role="status">
      <h2>{t('desktop.reviewSession.summary.clear')}</h2>
      {props.canContinueReading ? (
        <AppButton onClick={props.onContinueReading} size="md" variant="subtle">
          {t('desktop.reviewActions.continueReading')}
        </AppButton>
      ) : null}
    </section>
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

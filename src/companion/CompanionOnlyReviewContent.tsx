import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState } from '../shared/ui';

export function CompanionOnlyReviewContent() {
  const t = useTranslation();
  return (
    <section className="border-t border-companion-divider px-1 py-6">
      <AppEmptyState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description={t('companion.onlyReview.description')}
        title={t('companion.onlyReview.title')}
      />
    </section>
  );
}

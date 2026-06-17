import { GraduationCap } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState } from '../shared/ui';

import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';

export function CompanionOnlyReviewContent() {
  const t = useTranslation();
  return (
    <section className="border-t border-companion-divider px-1 py-6">
      <AppEmptyState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description={t('companion.onlyReview.description')}
        icon={<CompanionEmptyStateIcon Icon={GraduationCap} />}
        title={t('companion.onlyReview.title')}
      />
    </section>
  );
}

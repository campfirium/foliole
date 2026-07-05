import { GraduationCap } from 'lucide-react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppEmptyState } from '../shared/ui';

import { CompanionEmptyStateIcon } from './CompanionEmptyStateIcon';
import { CompanionReviewAnswer, CompanionReviewCard } from './CompanionReviewCard';
import type { CompanionReviewSession } from './companionReviewSession';

export function CompanionOnlyReviewContent(props: {
  hasSnapshot: boolean;
  isAnswerRevealed: boolean;
  reviewSession: CompanionReviewSession;
}) {
  const t = useTranslation();
  if (props.reviewSession.currentCard) {
    return (
      <>
        <CompanionReviewCard card={props.reviewSession.currentCard} />
        {props.isAnswerRevealed ? <CompanionReviewAnswer card={props.reviewSession.currentCard} /> : null}
      </>
    );
  }
  return (
    <section className="border-t border-companion-divider px-1 py-6">
      <AppEmptyState
        className="min-h-0 items-start text-left text-companion-text-secondary"
        description={resolveOnlyReviewDescription(t, props)}
        icon={<CompanionEmptyStateIcon Icon={GraduationCap} />}
        title={resolveOnlyReviewTitle(t, props)}
      />
    </section>
  );
}

function resolveOnlyReviewTitle(t: ReturnType<typeof useTranslation>, props: Parameters<typeof CompanionOnlyReviewContent>[0]) {
  if (!props.hasSnapshot) return t('companion.onlyReview.noTopicsTitle');
  if (props.reviewSession.scheduledFsrsCount === 0) return t('companion.onlyReview.noScheduledTitle');
  return t('companion.onlyReview.noDueTitle');
}

function resolveOnlyReviewDescription(t: ReturnType<typeof useTranslation>, props: Parameters<typeof CompanionOnlyReviewContent>[0]) {
  if (!props.hasSnapshot) return t('companion.review.connectForWork');
  if (props.reviewSession.scheduledFsrsCount === 0) return t('companion.onlyReview.noScheduledDescription');
  return t('companion.onlyReview.noDueDescription', { date: props.reviewSession.nextFsrsDueAt ?? '' });
}

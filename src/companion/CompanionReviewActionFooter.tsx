import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { ReviewActionBar } from '../shared/ui';

import { companionMobileRailClassName } from './companionCssCompatibility';

export function CompanionReviewActionFooter(props: {
  primary: ReactNode;
  reviewCardKey?: string | null;
  reviewItemKind?: 'fsrs' | 'reading';
  statusLabel?: string | null;
}) {
  const t = useTranslation();
  return (
    <footer className={`companion-review-footer fixed inset-x-0 bottom-0 z-workspace-overlay border-t border-companion-divider bg-companion-base ${companionMobileRailClassName} pt-3 pb-6 supports-[padding-bottom:calc(0px)]:[padding-bottom:calc(1.5rem+env(safe-area-inset-bottom))]`}>
      <div className="mx-auto w-full max-w-[760px]">
        <ReviewActionBar ariaLabel={t('companion.review.toolbar')}
          className="h-auto border-0 bg-transparent px-0" key={props.reviewCardKey} layout="full-width"
          mode="study" primary={props.primary} reviewInputMode="hotkeys"
          reviewItemKind={props.reviewItemKind ?? 'fsrs'} secondary={props.statusLabel ?? null} />
      </div>
    </footer>
  );
}

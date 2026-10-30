import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { ReviewActionBar } from '../shared/ui';

import { CompanionBottomBar } from './CompanionBottomBar';

export function CompanionReviewActionFooter(props: {
  primary: ReactNode;
  reviewCardKey?: string | null;
  reviewItemKind?: 'fsrs' | 'reading';
  statusLabel?: string | null;
}) {
  const t = useTranslation();
  return (
    <CompanionBottomBar className="companion-review-footer">
      <div className="h-full w-full">
        <ReviewActionBar ariaLabel={t('companion.review.toolbar')}
          className="h-full border-0 bg-transparent px-0" key={props.reviewCardKey} layout="full-width"
          mode="study" primary={props.primary} reviewInputMode="hotkeys"
          reviewItemKind={props.reviewItemKind ?? 'fsrs'} secondary={null} />
      </div>
      {props.statusLabel ? <div role="status" className="absolute inset-x-0 bottom-full border-b border-companion-divider bg-companion-base px-4 py-2 text-xs text-companion-text-secondary">{props.statusLabel}</div> : null}
    </CompanionBottomBar>
  );
}

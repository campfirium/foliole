import type { ReactNode } from 'react';

import { companionMobileRailClassName } from './companionCssCompatibility';

export function CompanionReviewHeader(props: { children: ReactNode }) {
  return (
    <div className={`companion-review-header fixed inset-x-0 top-0 z-surface-overlay bg-companion-base ${companionMobileRailClassName}`}>
      <div className="mx-auto max-w-[760px]">{props.children}</div>
    </div>
  );
}

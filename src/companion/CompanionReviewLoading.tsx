import type { ReactNode } from 'react';

import { CompanionArticleBodyStatusFallback } from './CompanionArticleBodyStatusFallback';
import { companionReviewSurfaceClassName } from './companionCssCompatibility';
import { CompanionReviewHeader } from './CompanionReviewHeader';

export function CompanionReviewLoading(props: { header: ReactNode; footer: ReactNode }) {
  return (
    <section className={companionReviewSurfaceClassName}>
      <CompanionReviewHeader>{props.header}</CompanionReviewHeader>
      <div className="mx-auto w-full max-w-[760px]">
        <CompanionArticleBodyStatusFallback bodyStatus="fetching" />
      </div>
      {props.footer}
    </section>
  );
}

import type { ReactNode } from 'react';

import { companionReviewSurfaceClassName } from './companionCssCompatibility';
import { CompanionReviewHeader } from './CompanionReviewHeader';

export function CompanionReviewLoading(props: { header: ReactNode; footer: ReactNode }) {
  return (
    <section aria-busy="true" className={companionReviewSurfaceClassName}>
      <CompanionReviewHeader>{props.header}</CompanionReviewHeader>
      {props.footer}
    </section>
  );
}

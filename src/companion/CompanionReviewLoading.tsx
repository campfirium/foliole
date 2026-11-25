import type { ReactNode } from 'react';

import { companionReviewSurfaceClassName } from './companionCssCompatibility';
import { CompanionReviewHeader } from './CompanionReviewHeader';
import { useCompanionReadingSystemBars } from './useCompanionReadingSystemBars';

export function CompanionReviewLoading(props: { header: ReactNode; footer: ReactNode }) {
  // A reader still loading its body keeps the immersive status bar, so a slow parent or next card never reveals it.
  useCompanionReadingSystemBars(false, false);
  return (
    <section aria-busy="true" className={companionReviewSurfaceClassName}>
      <CompanionReviewHeader>{props.header}</CompanionReviewHeader>
      {props.footer}
    </section>
  );
}

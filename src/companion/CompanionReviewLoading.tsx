import type { ReactNode } from 'react';

import { useCompanionReadingDisplayLayout } from './companionReadingDisplayLayout';
import { CompanionReviewHeader } from './CompanionReviewHeader';

export function CompanionReviewLoading(props: { header: ReactNode; footer: ReactNode }) {
  const layout = useCompanionReadingDisplayLayout(true, false, Boolean(props.header));
  return (
    <section aria-busy="true" className={layout.className} {...layout.bodyAttributes}>
      <CompanionReviewHeader>{props.header}</CompanionReviewHeader>
      {props.footer}
    </section>
  );
}

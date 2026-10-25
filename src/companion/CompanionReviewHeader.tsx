import type { ReactNode } from 'react';

export function CompanionReviewHeader(props: { children: ReactNode }) {
  return (
    <div className="companion-review-header">
      <div className="mx-auto max-w-[760px]">{props.children}</div>
    </div>
  );
}

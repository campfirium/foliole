import { Sprout } from 'lucide-react';

import { reviewProgressFraction, type ReviewToolbarProgressCounts } from '../features/review/model/reviewToolbarProgressLabel';

export function CompanionFlowProgress({ counts }: { counts: ReviewToolbarProgressCounts }) {
  const fraction = reviewProgressFraction(counts.completedItemCount + counts.completedTopicCount,
    counts.queuedItemCount + counts.queuedTopicCount);

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-4 top-0 z-10 h-px">
      <span className="absolute -top-[11.5px] -translate-x-1/2 text-[rgb(var(--role-legacy-border-rgb))]"
        style={{ left: `clamp(0.375rem, ${fraction * 100}%, calc(100% - 0.375rem))` }}>
        <Sprout className="size-3" strokeWidth={1.5} />
      </span>
    </span>
  );
}

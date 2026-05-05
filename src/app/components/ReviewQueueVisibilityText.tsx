import type { ReviewQueueVisibility } from './reviewQueueVisibility';

export function ReviewQueueVisibilityText({ visibility }: { visibility: ReviewQueueVisibility }) {
  return (
    <div aria-label="Review queue visibility" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-foreground/60">
      <span>{visibility.currentQueueLabel} live</span>
      <span>Review items {visibility.fsrsQueueCount}</span>
      <span>Reading {visibility.readingQueueCount}</span>
      <span>
        Mix {visibility.queueMixRatioReading}:{visibility.queueMixRatioFsrs}
      </span>
    </div>
  );
}

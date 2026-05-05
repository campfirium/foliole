import type { ReviewQueueVisibility } from './reviewQueueVisibility';

export function ReviewQueueVisibilityText({ visibility }: { visibility: ReviewQueueVisibility }) {
  return (
    <div aria-label="Push queue visibility" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-foreground/60">
      <span>Push queue live</span>
      <span>Current {visibility.currentQueueLabel}</span>
      <span>FSRS queue {visibility.fsrsQueueCount} left</span>
      <span>Reading queue {visibility.readingQueueCount} left</span>
      <span>
        Mix {visibility.queueMixRatioReading}:{visibility.queueMixRatioFsrs}
      </span>
    </div>
  );
}

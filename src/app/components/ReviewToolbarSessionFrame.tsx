import { Clock3, Sprout } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { cn } from '../../shared/lib/utils';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

import { ReviewSessionModeControl } from './ReviewSessionModeControl';

const READING_TIME_PLACEHOLDER_LABEL = 'Reading time (coming soon)';

function clampProgress(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function useFrozenReviewTotal(currentTotal: number) {
  const [frozenTotal, setFrozenTotal] = useState<number | null>(null);

  useEffect(() => {
    if (frozenTotal === null && currentTotal > 0) {
      setFrozenTotal(currentTotal);
    }
  }, [currentTotal, frozenTotal]);

  return frozenTotal ?? currentTotal;
}

function formatReviewProgressLabel(completed: number, remaining: number, total: number) {
  return `Today's review: ${remaining} left · ${Math.min(completed, total)} done · ${total} total`;
}

export function ReviewToolbarProgressLine({
  completedCount,
  queueCount
}: {
  completedCount: number;
  queueCount: number;
}) {
  const completed = Math.max(completedCount, 0);
  const currentTotal = completed + Math.max(queueCount, 0);
  const total = useFrozenReviewTotal(currentTotal);

  if (total <= 0) {
    return null;
  }

  const progress = clampProgress(completed / total);
  const progressPercent = `${progress * 100}%`;
  const progressLabel = formatReviewProgressLabel(completed, Math.max(queueCount, 0), total);
  const progressStyle = {
    '--review-sprout-position': `clamp(1.25rem, ${progressPercent}, calc(100% - 1.25rem))`
  } as CSSProperties;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={progressStyle}>
      <AppTooltip>
        <AppTooltipTrigger asChild>
          <span
            aria-label={progressLabel}
            className="pointer-events-auto absolute left-[var(--review-sprout-position)] top-[-13px] z-workspace-overlay inline-flex size-5 -translate-x-1/2 items-start justify-center text-[rgb(var(--color-border))]"
            role="img"
            tabIndex={0}
          >
            <span className="mt-1.5 inline-flex size-2 items-center justify-center bg-[var(--workspace-region-footer-document-bg)]">
              <Sprout aria-hidden="true" className="size-2" strokeWidth={2} />
            </span>
          </span>
        </AppTooltipTrigger>
        <AppTooltipContent align="center" arrow side="top" sideOffset={8}>
          {progressLabel}
        </AppTooltipContent>
      </AppTooltip>
    </div>
  );
}

export function ReviewToolbarSessionFrame({
  actions,
  className,
  modeControl
}: {
  actions: ReactNode;
  className?: string;
  modeControl: ReactNode;
}) {
  return (
    <div className={cn('grid grid-cols-[2rem_auto_2rem] items-center gap-2.5', className)}>
      <div className="flex min-w-0 justify-center">{modeControl}</div>
      <div className="flex min-w-0 items-center justify-center">{actions}</div>
      <span
        aria-label={READING_TIME_PLACEHOLDER_LABEL}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground/38"
        role="img"
        title={READING_TIME_PLACEHOLDER_LABEL}
      >
        <Clock3 aria-hidden="true" className="size-4" strokeWidth={1.8} />
      </span>
    </div>
  );
}

export function ReviewToolbarSessionActions({
  actions,
  onSetReviewSessionMode,
  reviewSessionMode
}: {
  actions: ReactNode;
  onSetReviewSessionMode: (mode: ReviewSessionMode) => void;
  reviewSessionMode: ReviewSessionMode;
}) {
  return (
    <ReviewToolbarSessionFrame
      actions={actions}
      modeControl={<ReviewSessionModeControl mode={reviewSessionMode} onChangeMode={onSetReviewSessionMode} />}
    />
  );
}

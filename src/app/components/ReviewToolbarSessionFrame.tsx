import { Sprout } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';
import { ReviewOverlayDivider } from '../../shared/ui/ReviewOverlayActionButton';

import { ReviewSessionModeControl } from './ReviewSessionModeControl';
import { fallbackProgressCounts, formatReviewProgressLabel, type ReviewToolbarProgressCounts } from './reviewToolbarProgressLabel';
import { ReviewToolbarSessionSummaryMenu } from './ReviewToolbarSessionSummaryMenu';

export type ReviewToolbarSessionSummaryStatus = 'clear' | 'in-progress' | 'not-started';

export interface ReviewToolbarSessionSummaryValues {
  readingElapsedMs: number;
  readTopicCount: number;
  reviewElapsedMs: number;
  reviewedItemCount: number;
}

export interface ReviewToolbarSessionSummary extends ReviewToolbarSessionSummaryValues {
  status: ReviewToolbarSessionSummaryStatus;
}

function clampProgress(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function ReviewToolbarProgressLine({
  completedCount,
  progressCounts,
  queueCount,
  reviewSessionMode
}: {
  completedCount: number;
  progressCounts?: ReviewToolbarProgressCounts;
  queueCount: number;
  reviewSessionMode: ReviewSessionMode;
}) {
  const completed = Math.max(completedCount, 0);
  const currentTotal = completed + Math.max(queueCount, 0);
  const total = currentTotal;

  if (total <= 0) {
    return null;
  }

  const progress = clampProgress(completed / total);
  const progressPercent = `${progress * 100}%`;
  const progressLabel = formatReviewProgressLabel(
    reviewSessionMode,
    progressCounts ?? fallbackProgressCounts(reviewSessionMode, completed, Math.max(queueCount, 0))
  );
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

export function ReviewSessionProgress({
  progressCounts,
  reviewCompletedCount,
  reviewQueueCount,
  reviewSessionMode,
  showProgress
}: {
  progressCounts?: ReviewToolbarProgressCounts;
  reviewCompletedCount: number;
  reviewQueueCount: number;
  reviewSessionMode: ReviewSessionMode;
  showProgress?: boolean;
}) {
  if (!showProgress) return null;
  return (
    <ReviewToolbarProgressLine
      completedCount={reviewCompletedCount}
      {...definedProps({ progressCounts })}
      queueCount={reviewQueueCount}
      reviewSessionMode={reviewSessionMode}
    />
  );
}

function ReviewToolbarSessionFrame({
  actions,
  className,
  modeControl,
  surface = 'panel',
  summary
}: {
  actions: ReactNode;
  className?: string;
  modeControl: ReactNode;
  surface?: 'panel' | 'overlay';
  summary?: ReviewToolbarSessionSummary;
}) {
  if (surface === 'overlay') {
    return (
      <div className={cn('flex items-center gap-2.5', className)}>
        <div className="flex min-w-0 justify-center">{modeControl}</div>
        <ReviewOverlayDivider />
        <div className="flex min-w-0 items-center justify-center">{actions}</div>
        <ReviewOverlayDivider />
        <div className="flex min-w-0 justify-center">{summary ? <ReviewToolbarSessionSummaryMenu summary={summary} /> : null}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[2rem_auto_2rem] items-center gap-2.5',
        className
      )}
    >
      <div className="flex min-w-0 justify-center">{modeControl}</div>
      <div className="flex min-w-0 items-center justify-center">{actions}</div>
      <div className="flex min-w-0 justify-center">{summary ? <ReviewToolbarSessionSummaryMenu summary={summary} /> : null}</div>
    </div>
  );
}

export function ReviewToolbarSessionActions({
  actions,
  modeControl,
  onSetReviewSessionMode,
  reviewSessionMode,
  surface = 'panel',
  summary
}: {
  actions: ReactNode;
  modeControl?: ReactNode;
  onSetReviewSessionMode?: (mode: ReviewSessionMode) => void;
  reviewSessionMode?: ReviewSessionMode;
  surface?: 'panel' | 'overlay';
  summary?: ReviewToolbarSessionSummary;
}) {
  const resolvedModeControl =
    modeControl ??
    (onSetReviewSessionMode && reviewSessionMode ? (
      <ReviewSessionModeControl mode={reviewSessionMode} onChangeMode={onSetReviewSessionMode} />
    ) : null);

  return <ReviewToolbarSessionFrame actions={actions} modeControl={resolvedModeControl} surface={surface} {...definedProps({ summary })} />;
}

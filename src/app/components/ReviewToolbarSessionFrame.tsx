import { Clock3, Sprout } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { definedProps } from '../../shared/lib/definedProps';
import { cn } from '../../shared/lib/utils';
import {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuTrigger,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

import { ReviewSessionModeControl } from './ReviewSessionModeControl';

const SESSION_SUMMARY_LABEL = 'Queue summary';
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

function formatReviewProgressLabel(mode: ReviewSessionMode, completed: number, remaining: number, total: number) {
  const done = Math.min(completed, total);
  if (mode === 'reading-only') {
    return `Reading flow: ${remaining} topics left · ${done} read · ${total} topics`;
  }
  if (mode === 'review-first') {
    return `Review queue: ${remaining} review items left · ${done} done · ${total} total`;
  }
  return `Flow queue: ${remaining} left · ${done} done · ${total} total`;
}

export function ReviewToolbarProgressLine({
  completedCount,
  queueCount,
  reviewSessionMode
}: {
  completedCount: number;
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
  const progressLabel = formatReviewProgressLabel(reviewSessionMode, completed, Math.max(queueCount, 0), total);
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
  reviewCompletedCount,
  reviewQueueCount,
  reviewSessionMode,
  showProgress
}: {
  reviewCompletedCount: number;
  reviewQueueCount: number;
  reviewSessionMode: ReviewSessionMode;
  showProgress?: boolean;
}) {
  if (!showProgress) return null;
  return (
    <ReviewToolbarProgressLine
      completedCount={reviewCompletedCount}
      queueCount={reviewQueueCount}
      reviewSessionMode={reviewSessionMode}
    />
  );
}

export function ReviewToolbarSessionFrame({
  actions,
  className,
  modeControl,
  summary
}: {
  actions: ReactNode;
  className?: string;
  modeControl: ReactNode;
  summary?: ReviewToolbarSessionSummary;
}) {
  return (
    <div className={cn('grid grid-cols-[2rem_auto_2rem] items-center gap-2.5', className)}>
      <div className="flex min-w-0 justify-center">{modeControl}</div>
      <div className="flex min-w-0 items-center justify-center">{actions}</div>
      <div className="flex min-w-0 justify-center">
        {summary ? <ReviewToolbarSessionSummaryMenu summary={summary} /> : null}
      </div>
    </div>
  );
}

export function ReviewToolbarSessionActions({
  actions,
  modeControl,
  onSetReviewSessionMode,
  reviewSessionMode,
  summary
}: {
  actions: ReactNode;
  modeControl?: ReactNode;
  onSetReviewSessionMode?: (mode: ReviewSessionMode) => void;
  reviewSessionMode?: ReviewSessionMode;
  summary?: ReviewToolbarSessionSummary;
}) {
  const resolvedModeControl =
    modeControl ??
    (onSetReviewSessionMode && reviewSessionMode ? (
      <ReviewSessionModeControl mode={reviewSessionMode} onChangeMode={onSetReviewSessionMode} />
    ) : null);

  return (
    <ReviewToolbarSessionFrame
      actions={actions}
      modeControl={resolvedModeControl}
      {...definedProps({ summary })}
    />
  );
}

function formatElapsedMs(elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 'Just now';
  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function SummaryRow({ count, elapsedMs, label, unit }: { count: number; elapsedMs: number; label: string; unit: string }) {
  if (count <= 0) return null;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4">
      <span className="text-xs text-foreground/48">{label}</span>
      <span className="text-right text-lg font-medium leading-none text-foreground/82">
        {count}
        <span className="ml-1.5 text-xs font-normal text-foreground/45">{count === 1 ? unit : `${unit}s`}</span>
      </span>
      <span className="min-w-16 text-right text-xs tabular-nums text-foreground/45">{formatElapsedMs(elapsedMs)}</span>
    </div>
  );
}

function getSummaryTitle(status: ReviewToolbarSessionSummaryStatus) {
  if (status === 'clear') return 'Queue clear';
  if (status === 'in-progress') return 'Queue in progress';
  return 'Queue not started';
}

function QueueSummaryRows({ summary }: { summary: ReviewToolbarSessionSummary }) {
  const hasRows = summary.reviewedItemCount > 0 || summary.readTopicCount > 0;
  if (!hasRows) {
    return <p className="text-xs text-foreground/45">No queue actions yet.</p>;
  }
  return (
    <div className="space-y-3">
      <SummaryRow count={summary.reviewedItemCount} elapsedMs={summary.reviewElapsedMs} label="Reviewed" unit="item" />
      <SummaryRow count={summary.readTopicCount} elapsedMs={summary.readingElapsedMs} label="Read" unit="topic" />
    </div>
  );
}

function ReviewToolbarSessionSummaryMenu({ summary }: { summary: ReviewToolbarSessionSummary }) {
  return (
    <AppDropdownMenu>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-label={SESSION_SUMMARY_LABEL}
          className="inline-flex size-8 items-center justify-center rounded-md text-foreground/38 outline-none transition-colors hover:bg-foreground/[0.04] hover:text-foreground/65 focus-visible:ring-1 focus-visible:ring-border-strong"
          type="button"
        >
          <Clock3 aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </button>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="center" avoidCollisions={false} className="w-64 p-4" side="top" sideOffset={10}>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.02em] text-foreground/45">
          {getSummaryTitle(summary.status)}
        </div>
        <QueueSummaryRows summary={summary} />
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

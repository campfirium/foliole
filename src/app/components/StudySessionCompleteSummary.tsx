import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';

export interface StudySessionCompleteSummaryProps {
  completedAt: string | null;
  createdItemCount: number;
  createdTopicCount: number;
  readingElapsedMs: number;
  readTopicCount: number;
  reviewElapsedMs: number;
  reviewedItemCount: number;
  reviewSessionMode: ReviewSessionMode;
  sessionStartedAt: string | null;
}

function formatElapsedMs(elapsedMs: number) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 'Just now';
  }
  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function pluralize(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function SummaryRow({
  count,
  elapsedMs,
  label,
  unit
}: {
  count: number;
  elapsedMs?: number;
  label: string;
  unit: string;
}) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(6rem,1fr)_auto_auto] items-baseline gap-x-5">
      <div className="text-sm font-normal text-muted-foreground">{label}</div>
      <div className="text-right">
        <span className="text-[26px] font-medium leading-none text-accent">{count}</span>
        <span className="ml-2 text-sm text-muted-foreground">{pluralize(count, unit)}</span>
      </div>
      <div className="min-w-20 text-right text-sm font-normal text-muted-foreground">
        {elapsedMs === undefined ? null : formatElapsedMs(elapsedMs)}
      </div>
    </div>
  );
}

function getCompletionTitle(mode: ReviewSessionMode) {
  if (mode === 'review-first') return 'Review items complete';
  if (mode === 'reading-only') return 'Reading session complete';
  return 'Session complete';
}

export function StudySessionCompleteSummary({
  createdItemCount,
  createdTopicCount,
  readingElapsedMs,
  readTopicCount,
  reviewElapsedMs,
  reviewSessionMode,
  reviewedItemCount
}: StudySessionCompleteSummaryProps) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center bg-canvas px-8 pt-[18vh] text-foreground">
      <div className="w-full max-w-[520px]">
        <h1 className="text-[30px] font-medium leading-tight text-accent">{getCompletionTitle(reviewSessionMode)}</h1>
        <div className="mt-8 space-y-3">
          {reviewedItemCount > 0 ? (
            <SummaryRow count={reviewedItemCount} elapsedMs={reviewElapsedMs} label="Reviewed" unit="item" />
          ) : null}
          {readTopicCount > 0 ? (
            <SummaryRow count={readTopicCount} elapsedMs={readingElapsedMs} label="Read" unit="topic" />
          ) : null}
          {createdItemCount > 0 || createdTopicCount > 0 ? (
            <div className="pt-4">
              {createdItemCount > 0 ? (
                <SummaryRow count={createdItemCount} label="Created" unit="item" />
              ) : null}
              {createdTopicCount > 0 ? (
                <SummaryRow count={createdTopicCount} label={createdItemCount > 0 ? '' : 'Created'} unit="topic" />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

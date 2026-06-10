import type { ReviewSessionMode } from '../../features/review/model/reviewSessionMode';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';

export interface StudySessionCompleteSummaryProps {
  completedAt: string | null;
  createdItemCount: number;
  createdTopicCount: number;
  readingElapsedMs: number;
  readTopicCount: number;
  reviewElapsedMs: number;
  reviewedItemCount: number;
  nextReviewDueAt: string | null;
  reviewSessionMode: ReviewSessionMode;
  sessionStartedAt: string | null;
}

function formatElapsedMs(elapsedMs: number, t: Translate) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return t('desktop.reviewComplete.justNow');
  }
  const totalMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  if (totalMinutes < 60) {
    return t('desktop.reviewComplete.minutes', { count: totalMinutes });
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes
    ? t('desktop.reviewComplete.hoursMinutes', { hours, minutes })
    : t('desktop.reviewComplete.hours', { count: hours });
}

function formatUnit(count: number, unit: 'item' | 'topic', t: Translate) {
  if (unit === 'item') {
    return t(count === 1 ? 'desktop.reviewComplete.item.one' : 'desktop.reviewComplete.item.many', { count });
  }
  return t(count === 1 ? 'desktop.reviewComplete.topic.one' : 'desktop.reviewComplete.topic.many', { count });
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
  unit: 'item' | 'topic';
}) {
  const t = useTranslation();
  return (
    <div className="grid min-h-12 grid-cols-[minmax(6rem,1fr)_auto_auto] items-baseline gap-x-5">
      <div className="text-sm font-normal text-muted-foreground">{label}</div>
      <div className="text-right">
        <span className="text-[26px] font-medium leading-none text-accent">{count}</span>
        <span className="ml-2 text-sm text-muted-foreground">{formatUnit(count, unit, t)}</span>
      </div>
      <div className="min-w-20 text-right text-sm font-normal text-muted-foreground">
        {elapsedMs === undefined ? null : formatElapsedMs(elapsedMs, t)}
      </div>
    </div>
  );
}

function getCompletionTitle(mode: ReviewSessionMode, t: Translate) {
  if (mode === 'review-first') return t('desktop.reviewComplete.title.reviewFirst');
  if (mode === 'reading-only') return t('desktop.reviewComplete.title.readingOnly');
  return t('desktop.reviewComplete.title.default');
}

function formatNextReviewDue(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short'
  }).format(date);
}

export function StudySessionCompleteSummary({
  createdItemCount,
  createdTopicCount,
  readingElapsedMs,
  readTopicCount,
  reviewElapsedMs,
  nextReviewDueAt,
  reviewSessionMode,
  reviewedItemCount
}: StudySessionCompleteSummaryProps) {
  const t = useTranslation();
  const nextReviewDue = reviewedItemCount > 0 ? formatNextReviewDue(nextReviewDueAt) : null;
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center bg-canvas px-8 pt-[18vh] text-foreground">
      <div className="w-full max-w-[520px]">
        <h1 className="text-[30px] font-medium leading-tight text-accent">{getCompletionTitle(reviewSessionMode, t)}</h1>
        <div className="mt-8 space-y-3">
          {reviewedItemCount > 0 ? (
            <SummaryRow count={reviewedItemCount} elapsedMs={reviewElapsedMs} label={t('desktop.reviewComplete.reviewed')} unit="item" />
          ) : null}
          {readTopicCount > 0 ? (
            <SummaryRow count={readTopicCount} elapsedMs={readingElapsedMs} label={t('desktop.reviewComplete.read')} unit="topic" />
          ) : null}
          {createdItemCount > 0 || createdTopicCount > 0 ? (
            <div className="pt-4">
              {createdItemCount > 0 ? (
                <SummaryRow count={createdItemCount} label={t('desktop.reviewComplete.created')} unit="item" />
              ) : null}
              {createdTopicCount > 0 ? (
                <SummaryRow count={createdTopicCount} label={createdItemCount > 0 ? '' : t('desktop.reviewComplete.created')} unit="topic" />
              ) : null}
            </div>
          ) : null}
          {nextReviewDue ? (
            <div className="mt-7 border-t border-border/60 pt-4">
              <div className="grid min-h-10 grid-cols-[minmax(6rem,1fr)_auto] items-baseline gap-x-5">
                <div className="text-sm font-normal text-muted-foreground">{t('desktop.reviewComplete.nextReview')}</div>
                <div className="text-right text-base font-medium tabular-nums text-accent">{nextReviewDue}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

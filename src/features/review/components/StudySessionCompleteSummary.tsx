import type { ReactNode } from 'react';

import { useTranslation, type Translate } from '../../../shared/localization/LocalizationProvider';
import type { ReviewSessionMode } from '../model/reviewSessionMode';

export interface StudySessionCompleteSummaryProps {
  action?: ReactNode;
  layout?: 'desktop' | 'companion';
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
  elapsedMs?: number | undefined;
  label: string;
  unit: 'item' | 'topic';
}) {
  const t = useTranslation();
  return (
    <div className="study-session-summary-row grid min-h-12 grid-cols-[minmax(6rem,1fr)_auto_auto] items-baseline gap-x-5">
      <div className="text-sm font-normal text-muted-foreground">{label}</div>
      <div className="text-right">
        <span className="text-[26px] font-medium leading-none text-foreground/90">{count}</span>
        <span className="ml-2 text-sm text-muted-foreground">{formatUnit(count, unit, t)}</span>
      </div>
      <div className="study-session-summary-time min-w-20 text-right text-sm font-normal text-muted-foreground">
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

export function StudySessionCompleteSummary({
  action,
  layout = 'desktop',
  createdItemCount,
  createdTopicCount,
  readingElapsedMs,
  readTopicCount,
  reviewElapsedMs,
  reviewSessionMode,
  reviewedItemCount
}: StudySessionCompleteSummaryProps) {
  const t = useTranslation();
  const showEmptyCounts = layout === 'companion';
  const Heading = layout === 'companion' ? 'h2' : 'h1';
  return (
    <div className={layout === 'companion' ? 'companion-flow-complete' : "flex min-h-0 flex-1 items-start justify-center bg-[var(--role-content-bg)] px-8 pt-[18vh] text-foreground"}>
      <div className="w-full max-w-[520px]">
        <Heading className="text-[30px] font-medium leading-tight text-foreground/90">{getCompletionTitle(reviewSessionMode, t)}</Heading>
        <div className="study-session-summary-results mt-8 space-y-3">
          {reviewedItemCount > 0 || showEmptyCounts ? (
            <SummaryRow count={reviewedItemCount} elapsedMs={reviewedItemCount > 0 ? reviewElapsedMs : undefined} label={t('desktop.reviewComplete.reviewed')} unit="item" />
          ) : null}
          {readTopicCount > 0 || showEmptyCounts ? (
            <SummaryRow count={readTopicCount} elapsedMs={readTopicCount > 0 ? readingElapsedMs : undefined} label={t('desktop.reviewComplete.read')} unit="topic" />
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
        </div>
        {action ? <div className="mt-8 border-t border-[var(--role-content-line)] pt-6">{action}</div> : null}
      </div>
    </div>
  );
}
